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
import { validatePassword } from "@/lib/password-policy"

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
    developer_mode?: boolean;
    installer_all_jobs?: boolean;
    is_subcontractor?: boolean;
    department_id?: string | null;
    clients?: { name: string } | null;
}

export function UserManager() {
    const supabase = createClient()
    const [users, setUsers] = useState<UserData[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [passwordAction, setPasswordAction] = useState<"set" | "email" | null>(null)
    const [showPasswordFields, setShowPasswordFields] = useState(false)
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [currentUserInfo, setCurrentUserInfo] = useState<{ id: string; role: string | null } | null>(null)

    // Form state
    const [editingUserId, setEditingUserId] = useState<string | null>(null)
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [name, setName] = useState("")
    const [role, setRole] = useState("client_store")
    const [clientId, setClientId] = useState<string | null>("none")
    const [departmentId, setDepartmentId] = useState("none")
    const [departments, setDepartments] = useState<{id:string;name:string}[]>([])
    const [installJobs, setInstallJobs] = useState<{id:string;title:string;job_number:string|null}[]>([])
    const [assignedJobIds, setAssignedJobIds] = useState<string[]>([])
    const [allInstallJobs, setAllInstallJobs] = useState(false)
    const [developerMode, setDeveloperMode] = useState(false)

    // Only the current super_admin can grant/revoke developer_mode, and the
    // checkbox is hidden from everyone else.
    const canEditDeveloperMode = currentUserInfo?.role === "super_admin"
    const canManagePasswords = currentUserInfo?.role === "super_admin"

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
        if (!user) return
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()
        setCurrentUserInfo({ id: user.id, role: (profile?.role as string | undefined) ?? null })
    }, [supabase])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchUsers()
        fetchClients()
        fetchCurrentUser()
        void supabase.from("departments").select("id,name").order("name").then(({data}: {data: {id:string;name:string}[] | null})=>setDepartments(data || []))
        void supabase.from("costing_jobs").select("id,title,job_number").eq("is_template",false).in("status",["approved","in_progress","complete"]).order("created_at",{ascending:false}).limit(1000).then(({data}: {data: {id:string;title:string;job_number:string|null}[] | null})=>setInstallJobs(data || []))
    }, [fetchUsers, fetchClients, fetchCurrentUser, supabase])

    const openCreateDialog = () => {
        setShowPasswordFields(false)
        setNewPassword("")
        setConfirmPassword("")
        setEditingUserId(null)
        setEmail("")
        setPassword("")
        setName("")
        setRole("client_store")
        setClientId("none")
        setDeveloperMode(false)
        setDepartmentId("none")
        setAssignedJobIds([])
        setAllInstallJobs(false)
        setIsDialogOpen(true)
    }

    const openEditDialog = (user: UserData) => {
        setShowPasswordFields(false)
        setNewPassword("")
        setConfirmPassword("")
        setEditingUserId(user.id)
        setEmail(user.email)
        setPassword("") // Leave blank on edit
        setName(user.name || "")
        setRole(user.role === "installer" && user.is_subcontractor ? "subcontractor" : user.role || "client_store")
        setClientId(user.client_id || "none")
        setDeveloperMode(Boolean(user.developer_mode))
        setDepartmentId(user.department_id || "none")
        setAssignedJobIds([])
        setAllInstallJobs(Boolean(user.installer_all_jobs))
        if (user.role === "installer") {
            void supabase.from("installer_jobs").select("job_id").eq("user_id",user.id)
                .then(({data,error}: {data: {job_id:string}[] | null; error: {message:string} | null}) => { if (error) toast.error(error.message); else setAssignedJobIds((data || []).map(item=>item.job_id)) })
        }
        setIsDialogOpen(true)
    }

    const managePassword = async (action: "set" | "email") => {
        if (!editingUserId || !canManagePasswords) return
        if (action === "set") {
            const policyError = validatePassword(newPassword)
            if (policyError) { toast.error(policyError); return }
            if (newPassword !== confirmPassword) { toast.error("Passwords do not match"); return }
        }

        setPasswordAction(action)
        try {
            const response = await fetch(`/api/users/${editingUserId}/password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(action === "set"
                    ? { action, password: newPassword, confirmPassword }
                    : { action }),
            })
            const result = await response.json() as { error?: string; message?: string }
            if (!response.ok) throw new Error(result.error || "Password action failed")
            toast.success(action === "set" ? "Password changed successfully" : `Password reset email requested for ${email}`)
            if (action === "set") {
                setNewPassword("")
                setConfirmPassword("")
                setShowPasswordFields(false)
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Password action failed")
        } finally {
            setPasswordAction(null)
        }
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)

        try {
            if (role === "department_operator" && departmentId === "none") throw new Error("Select a department for this operator")
            const isSubcontractor = role === "subcontractor"
            const databaseRole = isSubcontractor ? "installer" : role
            const hasAllInstallJobs = role === "installer" && allInstallJobs
            const finalClientId = role === "department_operator" || role === "mobile_admin" || isSubcontractor || clientId === "none" ? null : clientId

            if (!editingUserId && isSubcontractor) {
                const response = await fetch('/api/users/invite', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, name, jobIds: assignedJobIds }),
                })
                const result = await response.json() as { error?: string; message?: string }
                if (!response.ok) throw new Error(result.error || 'Invitation failed')
                toast.success(result.message || 'Invitation sent')
                setIsDialogOpen(false)
                await fetchUsers()
                return
            }

            let savedUserId = editingUserId
            if (editingUserId) {
                // Edit user in our table. developer_mode is only included in
                // the update payload when the caller is a super_admin; the
                // RLS policy refuses the change otherwise, but we also gate
                // here so the wire doesn't carry an attempt that'll fail.
                const updatePayload: Record<string, unknown> = {
                    name,
                    role: databaseRole,
                    is_subcontractor: isSubcontractor,
                    client_id: finalClientId,
                    department_id: role === "department_operator" ? departmentId : null,
                    installer_all_jobs: hasAllInstallJobs,
                    updated_at: new Date().toISOString(),
                }
                if (canEditDeveloperMode) updatePayload.developer_mode = developerMode

                const { error } = await supabase
                    .from('users')
                    .update(updatePayload)
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
                        role: databaseRole,
                        is_subcontractor: isSubcontractor,
                        client_id: finalClientId,
                    department_id: role === "department_operator" ? departmentId : null,
                    installer_all_jobs: hasAllInstallJobs,
                    })

                if (dbError) {
                    // Cleanup auth user if DB insert fails (we can't easily without service role, but we show error)
                    throw dbError
                }

                savedUserId = authData.user.id

                toast.success("User created successfully")
            }

            if (savedUserId && databaseRole === "installer") {
                const { data: existing, error: assignmentError } = await supabase.from("installer_jobs").select("job_id").eq("user_id",savedUserId)
                if (assignmentError) throw assignmentError
                const existingIds = new Set<string>(((existing || []) as {job_id:string}[]).map(item=>item.job_id))
                const desiredIds = new Set<string>(hasAllInstallJobs ? [] : assignedJobIds)
                const visibleIds = new Set(installJobs.map(job=>job.id))
                const removed = [...existingIds].filter(id=>(hasAllInstallJobs || visibleIds.has(id)) && !desiredIds.has(id))
                const added = [...desiredIds].filter(id=>!existingIds.has(id))
                if (removed.length) { const {error} = await supabase.from("installer_jobs").delete().eq("user_id",savedUserId).in("job_id",removed); if (error) throw error }
                if (added.length) { const {error} = await supabase.from("installer_jobs").insert(added.map(job_id=>({job_id,user_id:savedUserId}))); if (error) throw error }
            } else if (savedUserId) {
                const {error} = await supabase.from("installer_jobs").delete().eq("user_id",savedUserId)
                if (error) throw error
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

            <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
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
                                <TableRow
                                    key={user.id}
                                    onClick={() => openEditDialog(user)}
                                    className="group transition-colors cursor-pointer hover:bg-accent/30"
                                >
                                    <TableCell className="font-medium group-hover:text-primary transition-colors">{user.name || "—"}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                                            {user.is_subcontractor ? "Subcontractor" : user.role === "installer" ? "RPM Mobile worker" : user.role}
                                        </span>
                                    </TableCell>
                                    <TableCell>{user.clients?.name || "—"}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground hover:text-primary"
                                                onClick={(e) => { e.stopPropagation(); openEditDialog(user) }}
                                            >
                                                <Edit2 className="size-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-muted-foreground hover:text-destructive"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(user.id) }}
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
                <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingUserId ? "Edit User" : "Create New User"}</DialogTitle>
                        <DialogDescription>
                            {editingUserId 
                                ? "Update the user's information and role."
                                : role === "subcontractor"
                                    ? "Invite a subcontractor by email. They will set their own password."
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

                        {!editingUserId && role !== "subcontractor" && (
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
                                    <SelectItem value="department_operator">Department Operator (CNC / production)</SelectItem>
                                    <SelectItem value="installer">RPM Mobile worker (factory / installer)</SelectItem>
                                    <SelectItem value="subcontractor">Subcontractor (assigned jobs only)</SelectItem>
                                    <SelectItem value="mobile_admin">Mobile Admin (all operational jobs)</SelectItem>
                                    <SelectItem value="technician">Technician</SelectItem>
                                    <SelectItem value="client_hq">Client HQ</SelectItem>
                                    <SelectItem value="client_store">Client Store</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            {role === "department_operator" && <div className="space-y-2"><Label htmlFor="department_id">Department</Label><select id="department_id" className="w-full rounded border p-2" value={departmentId} onChange={e=>setDepartmentId(e.target.value)} required><option value="none">Select department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><p className="text-xs text-muted-foreground">Only assigned production jobs, time and material usage. No pricing or administration.</p></div>}
                            {(role === "installer" || role === "subcontractor") && <div className="space-y-2">
                                {role === "installer" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={allInstallJobs} onChange={e=>setAllInstallJobs(e.target.checked)} /><span><strong>All install jobs</strong><span className="block text-xs text-muted-foreground">Automatically show jobs containing Site Time Labour items, including future jobs. Quoted jobs are view only until approved.</span></span></label>}
                                {(role === "subcontractor" || !allInstallJobs) && <><Label>Assigned mobile jobs</Label><div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">{installJobs.map(job=><label key={job.id} className="flex gap-2 text-sm"><input type="checkbox" checked={assignedJobIds.includes(job.id)} onChange={e=>setAssignedJobIds(current=>e.target.checked?[...current,job.id]:current.filter(id=>id!==job.id))} />{job.job_number || "Job"} · {job.title}</label>)}</div><p className="text-xs text-muted-foreground">{role === "subcontractor" ? "Subcontractors see only these jobs and their sites in RPM Mobile." : "Only selected jobs appear in RPM Mobile."}</p></>}
                            </div>}
                            {role === "mobile_admin" && <p className="text-xs text-muted-foreground">Full operational access in RPM Mobile: all jobs, photos, notes, materials and time. No web administration or pricing access.</p>}
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

                        {canEditDeveloperMode && editingUserId && (
                            <div className="space-y-1.5 pt-1">
                                <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={developerMode}
                                        onChange={(e) => setDeveloperMode(e.target.checked)}
                                        className="size-4 accent-primary mt-0.5"
                                    />
                                    <span>
                                        <span className="font-medium text-foreground">Developer mode</span>
                                        <span className="block text-xs text-muted-foreground">
                                            Grants access to AI Auto-Build on the feature-suggestion form.
                                            Only grant to trusted developers — AI submissions can push code to dev.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        )}

                        {editingUserId && canManagePasswords && (
                            <div className="space-y-3 border-t pt-4">
                                <div>
                                    <p className="text-sm font-medium">Password management</p>
                                    <p className="text-xs text-muted-foreground">Change this user&apos;s password or email them a link to set their own.</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" disabled={!!passwordAction} onClick={() => {
                                        setShowPasswordFields(!showPasswordFields)
                                        setNewPassword("")
                                        setConfirmPassword("")
                                    }}>
                                        {showPasswordFields ? "Cancel password change" : "Change Password"}
                                    </Button>
                                    <Button type="button" variant="outline" disabled={!!passwordAction} onClick={() => void managePassword("email")}>
                                        {passwordAction === "email" && <Loader2 className="mr-2 size-4 animate-spin" />}
                                        Send password reset email
                                    </Button>
                                </div>
                                {showPasswordFields && (
                                    <div className="space-y-3 rounded-md border p-3">
                                        <p className="text-xs text-muted-foreground">Use at least 8 characters with lowercase, uppercase, and a number.</p>
                                        <div className="space-y-2">
                                            <Label htmlFor="new-password">New Password</Label>
                                            <Input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="confirm-password">Confirm Password</Label>
                                            <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                                        </div>
                                        <Button type="button" disabled={!!passwordAction} onClick={() => void managePassword("set")}>
                                            {passwordAction === "set" && <Loader2 className="mr-2 size-4 animate-spin" />}
                                            Save new password
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                                {isSaving ? "Saving..." : !editingUserId && role === "subcontractor" ? "Send invitation" : "Save User"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}

