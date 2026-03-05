"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, Camera, X, Image as ImageIcon } from "lucide-react"

interface JobFormProps {
    storeId: string
    onSuccess?: () => void
}

export function JobForm({ storeId, onSuccess }: JobFormProps) {
    const router = useRouter()
    const supabase = createClient()
    const [loading, setLoading] = useState(false)
    const [fetchingAssets, setFetchingAssets] = useState(true)
    const [fetchingProjects, setFetchingProjects] = useState(true)
    const [fetchingVendors, setFetchingVendors] = useState(true)
    const [assets, setAssets] = useState<any[]>([])
    const [projects, setProjects] = useState<any[]>([])
    const [vendors, setVendors] = useState<any[]>([])
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [previews, setPreviews] = useState<string[]>([])

    const [formData, setFormData] = useState({
        asset_id: "none",
        project_id: "none",
        vendor_id: "none",
        job_type: "fault",
        title: "",
        description: "",
        severity: "medium",
    })

    useEffect(() => {
        async function fetchData() {
            setFetchingAssets(true)
            setFetchingProjects(true)
            setFetchingVendors(true)

            // Fetch Assets
            const { data: assetsData } = await supabase
                .from('assets')
                .select(`
                    id,
                    asset_group,
                    asset_types (
                        label
                    )
                `)
                .eq('store_id', storeId)

            setAssets(assetsData || [])
            setFetchingAssets(false)

            // Fetch Projects
            const { data: projectsData } = await supabase
                .from('projects')
                .select('id, name')
                .order('name')

            setProjects(projectsData || [])
            setFetchingProjects(false)

            // Fetch Vendors
            const { data: vendorsData } = await supabase
                .from('vendors')
                .select('id, name, trade')
                .eq('status', 'active')
                .order('name')

            setVendors(vendorsData || [])
            setFetchingVendors(false)
        }
        fetchData()
    }, [storeId, supabase])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length + selectedFiles.length > 5) {
            toast.error("Maximum 5 images allowed")
            return
        }

        setSelectedFiles(prev => [...prev, ...files])

        const newPreviews = files.map(file => URL.createObjectURL(file))
        setPreviews(prev => [...prev, ...newPreviews])
    }

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
        setPreviews(prev => {
            const newPreviews = [...prev]
            URL.revokeObjectURL(newPreviews[index])
            return newPreviews.filter((_, i) => i !== index)
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const { data: userData } = await supabase.auth.getUser()
            const userId = userData.user?.id || null

            // 1. Upload Images
            const media_urls: string[] = []
            for (const file of selectedFiles) {
                const fileExt = file.name.split('.').pop()
                const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
                const filePath = `${storeId}/${fileName}`

                const { error: uploadError, data } = await supabase.storage
                    .from('job-attachments')
                    .upload(filePath, file)

                if (uploadError) {
                    console.error('Upload error:', uploadError)
                    continue
                }

                if (data) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('job-attachments')
                        .getPublicUrl(data.path)
                    media_urls.push(publicUrl)
                }
            }

            // 2. Insert Job
            const insertData: any = {
                store_id: storeId,
                asset_id: formData.asset_id === 'none' ? null : (formData.asset_id || null),
                project_id: formData.project_id === 'none' ? null : (formData.project_id || null),
                vendor_id: formData.vendor_id === 'none' ? null : (formData.vendor_id || null),
                job_type: formData.job_type,
                title: formData.title,
                description: formData.description,
                severity: formData.severity,
                status: 'open',
                media_urls: media_urls
            }

            if (userId) {
                insertData.reported_by = userId
            }

            const { error } = await supabase
                .from('jobs')
                .insert(insertData)

            if (error) throw error

            toast.success("Job created successfully with " + media_urls.length + " photos")

            // Cleanup previews
            previews.forEach(url => URL.revokeObjectURL(url))

            if (onSuccess) {
                onSuccess()
            } else {
                router.push(`/stores/${storeId}`)
                router.refresh()
            }
        } catch (error: any) {
            toast.error(error.message || "Failed to create job")
        } finally {
            setLoading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6 bg-card rounded-xl border shadow-sm">
            <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight">Report a New Job</h2>
                <p className="text-sm text-muted-foreground italic">Fill in the details below to log a fault or maintenance request.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="job_type">Job Type</Label>
                    <Select
                        value={formData.job_type}
                        onValueChange={(v) => setFormData({ ...formData, job_type: v })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="fault">Fault / Repair</SelectItem>
                            <SelectItem value="maintenance">Preventative Maintenance</SelectItem>
                            <SelectItem value="project">New Installation / Project</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="severity">Severity</Label>
                    <Select
                        value={formData.severity}
                        onValueChange={(v) => setFormData({ ...formData, severity: v })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="low">Low (Non-urgent)</SelectItem>
                            <SelectItem value="medium">Medium (Standard)</SelectItem>
                            <SelectItem value="high">High (Priority / Urgent)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="asset_id">Affected Asset (Optional)</Label>
                    <Select
                        value={formData.asset_id}
                        onValueChange={(v) => setFormData({ ...formData, asset_id: v })}
                        disabled={fetchingAssets}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={fetchingAssets ? "Loading assets..." : "Select an asset"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">No specific asset (Site-wide issue)</SelectItem>
                            {assets.map((asset) => (
                                <SelectItem key={asset.id} value={asset.id}>
                                    {asset.asset_types?.label} — {asset.asset_group}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="project_id">HQ Strategic Project (Optional)</Label>
                    <Select
                        value={formData.project_id}
                        onValueChange={(v) => setFormData({ ...formData, project_id: v })}
                        disabled={fetchingProjects}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={fetchingProjects ? "Loading projects..." : "Link to capital project"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">No linked project (Stand-alone repair)</SelectItem>
                            {projects.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="vendor_id">Assign Vendor / Contractor</Label>
                    <Select
                        value={formData.vendor_id}
                        onValueChange={(v) => setFormData({ ...formData, vendor_id: v })}
                        disabled={fetchingVendors}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder={fetchingVendors ? "Loading vendors..." : "Select specialized contractor"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">Unassigned (Internal / TBD)</SelectItem>
                            {vendors.map((v: any) => (
                                <SelectItem key={v.id} value={v.id}>
                                    {v.name} ({v.trade})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="title">Job Summary / Title</Label>
                <Input
                    id="title"
                    placeholder="e.g. Broken Pylon Light, Digital Menu Black Screen"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                />
            </div>

            <div className="space-y-2">
                <Label>Attach Photos (Optional)</Label>
                <div className="flex flex-wrap gap-4 mt-2">
                    {previews.map((url, index) => (
                        <div key={url} className="relative group w-24 h-24 border rounded-lg overflow-hidden bg-muted">
                            <img src={url} alt="Preview" className="w-full h-full object-cover" />
                            <button
                                type="button"
                                onClick={() => removeFile(index)}
                                className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X className="size-3" />
                            </button>
                        </div>
                    ))}
                    {selectedFiles.length < 5 && (
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                id="photo-upload"
                            />
                            <div className="flex flex-col items-center justify-center w-24 h-24 border-2 border-dashed border-muted rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all">
                                <Camera className="size-6 text-muted-foreground mb-1" />
                                <span className="text-[10px] font-medium text-muted-foreground">Add Photo</span>
                            </div>
                        </div>
                    )}
                </div>
                <p className="text-[10px] text-muted-foreground italic">Up to 5 images. Max 5MB each.</p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="description">Detailed Description</Label>
                <Textarea
                    id="description"
                    placeholder="Please describe the issue in detail..."
                    rows={4}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                    disabled={loading}
                >
                    Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Job
                </Button>
            </div>
        </form>
    )
}
