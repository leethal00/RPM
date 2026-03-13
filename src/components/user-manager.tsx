"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, Edit2, UserCog } from "lucide-react"

interface Client {
    id: string;
    name: string;
}

interface UserData {
    id: string;
    email: string;
    name?: string;
    role: string;
    client_id?: string;
    clients?: { name: string } | null;
}

export function UserManager() {
    const supabase = createClient()
    const [users, setUsers] = useState<UserData[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [currentUserInfo, setCurrentUserInfo] = useState<{ id: string } | null>(null)

    // Form state
    const [editingUserId, setEditingUserId] = useState<string | null>(null)
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [name, setName] = useState("")
    const [role, setRole] = useState("client_store")
    const [clientId, setClientId] = useState<string | null>("none")

    const fetchUsers = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('users')
            .select(`
                *,
                clients ( name )
            `)
            .order('created_at', { ascending: false })

        if (error) {
            toast.error(error.message)
        } else {
            setUsers(data as unknown as UserData[])
        }
        setLoading(false)
    }, [supabase])

    const fetchClients = useCallback(async () => {
        const { data } = await supabase.from('clients').select('*').order('name')
        if (data) setClients(data as unknown as Client[])
    }, [supabase])

    const fetchCurrentUser = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) setCurrentUserInfo({ id: user.id })
    }, [supabase])

    useEffect(() => {
        fetchUsers()
        fetchClients()
        fetchCurrentUser()
    }, [fetchUsers, fetchClients, fetchCurrentUser])

    const openCreateDialog = () => {
        setEditingUserId(null)
        setEmail("")
        setPassword("")
        setName("")
        setRole("client_store")
        setClientId("none")
        setIsDialogOpen(true)
    }

    const openEditDialog = (user: UserData) => {
        setEditingUserId(user.id)
        setEmail(user.email)
        setPassword("") // Leave blank on edit
        setName(user.name || "")
        setRole(user.role || "client_store")
        setClientId(user.client_id || "none")
        setIsDialogOpen(true)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)

        try {
            const finalClientId = clientId === "none" ? null : clientId

            if (editingUserId) {
                // Edit user in our table
                const { error } = await supabase
                    .from('users')
                    .update({
                        name,
                        role,
                        client_id: finalClientId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingUserId)

                if (error) throw error
                toast.success("User updated successfully")
            } else {
                // Create user using a temporary auth client to avoid logging out current user
                if (!password) {
                    toast.error("Password is required for new users")
                    setIsSaving(false)
                    return
                }

                const tempAuthClient = createSupabaseClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
                    { auth: { persistSession: false, autoRefreshToken: false } }
                )

                const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
                    email,
                    password,
                })

                if (authError) throw authError
                if (!authData.user) throw new Error("Failed to create auth user")

                // Insert into our users table
                const { error: dbError } = await supabase
                    .from('users')
                    .insert({
                        id: authData.user.id,
                        email,
                        name,
                        role,
                        client_id: finalClientId,
                    })

                if (dbError) {
                    // Cleanup auth user if DB insert fails (we can't easily without service role, but we show error)
                    throw dbError
                }

                toast.success("User created successfully")
            }

            setIsDialogOpen(false)
            fetchUsers()
        } catch (error: unknown) {
            const err = error as Error;
            toast.error(err.message || "An error occurred")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (currentUserInfo && currentUserInfo.id === id) {
            toast.error("You cannot delete your own account")
            return
        }

        if (!confirm("Are you sure you want to delete this user? They will lose access to the system.")) return

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', id)

        if (error) {
            toast.error(error.message)
        } else {
            toast.success("User deleted")
            fetchUsers()
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <UserCog className="size-5 text-primary" />
                        User Management
                    </h3>
                    <p className="text-sm text-muted-foreground">Manage system users, their roles, and client access.</p>
                </div>
                <Button onClick={openCreateDialog} className="gap-2">
                    <Plus className="size-4" />
                    Add User
                </Button>
            </div>

            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead className="w-[100px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <Loader2 className="size-6 animate-spin mx-auto text-muted-foreground" />
                                </TableCell>
                            </TableRow>
                        ) : users.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            users.map((user) => (
                                <TableRow key={user.id} className="group transition-colors">
                                    <TableCell className="font-medium">{user.name || "—"}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                                            {user.role}
                                        </span>
                                    </TableCell>
                                    <TableCell>{user.clients?.name || "—"}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground hover:text-primary"
                                                onClick={() => openEditDialog(user)}
                                            >
                                                <Edit2 className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground hover:text-destructive"
                                                onClick={() => handleDelete(user.id)}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>{editingUserId ? "Edit User" : "Create New User"}</DialogTitle>
                        <DialogDescription>
                            {editingUserId 
                                ? "Update the user's information and role."
                                : "Add a new user to the system. They will use these credentials to log in."}
                        </DialogDescription>
                    </DialogHeader>
                    
                    <form onSubmit={handleSave} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={!!editingUserId} // Can't edit email once created without service role
                                required
                            />
                        </div>

                        {!editingUserId && (
                            <div className="space-y-2">
                                <Label htmlFor="password">Temporary Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required={!editingUserId}
                                />
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="role">System Role</Label>
                            <Select value={role} onValueChange={setRole}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a role" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="super_admin">Super Admin</SelectItem>
                                    <SelectItem value="rodier_admin">Rodier Admin</SelectItem>
                                    <SelectItem value="technician">Technician</SelectItem>
                                    <SelectItem value="client_hq">Client HQ</SelectItem>
                                    <SelectItem value="client_store">Client Store</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="client_id">Assign to Client (Optional)</Label>
                            <Select value={clientId || "none"} onValueChange={(val) => setClientId(val)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="No client assigned" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No Client</SelectItem>
                                    {clients.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Only required for client-specific roles (HQ, Store).
                            </p>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                                {isSaving ? "Saving..." : "Save User"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
