"use client"

import { useState, useEffect, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, Camera, X } from "lucide-react"
import { AssetPhotoGallery } from "./asset-photo-gallery"
import type { AssetType, Asset } from "@/types/database"
import { assetSchema, getValidationErrors } from "@/lib/validations"
import { ensureRenderable, isHeic } from "@/lib/image-prep"
import { uploadPendingAssetPhoto } from "@/lib/asset-photo-upload"
import { useCustomerFilter } from "@/lib/customer-filter"

interface AssetFormProps {
    storeId: string
    asset?: Asset
    onSuccess: () => void
    onCancel: () => void
    onBusyChange?: (busy: boolean) => void
}

export function AssetForm({ storeId, asset, onSuccess, onCancel, onBusyChange }: AssetFormProps) {
    const supabase = createClient()
    const { isAdmin } = useCustomerFilter()
    const [loading, setLoading] = useState(false)
    const [assetTypes, setAssetTypes] = useState<AssetType[]>([])
    const [addingType, setAddingType] = useState(false)
    const [newTypeName, setNewTypeName] = useState("")
    const [typeSaving, setTypeSaving] = useState(false)
    const [typeError, setTypeError] = useState("")
    const [pendingPhotos, setPendingPhotos] = useState<{ id: string; file: File; url: string; error?: string }[]>([])
    const [preparing, setPreparing] = useState(false)
    const [internalOnly, setInternalOnly] = useState(false)
    const [createdAssetId, setCreatedAssetId] = useState<string | null>(null)
    const [saveError, setSaveError] = useState("")
    const busy = useRef(false)
    const previewUrls = useRef(new Set<string>())
    const hasThumbnail = useRef(false)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        const urls = previewUrls.current
        return () => {
            mounted.current = false
            urls.forEach(url => URL.revokeObjectURL(url))
            urls.clear()
        }
    }, [])

    const queuePhotos = async (files: File[]) => {
        if (busy.current) return
        busy.current = true
        setPreparing(true)
        onBusyChange?.(true)
        try {
            for (const raw of files) {
                if ((!raw.type.startsWith("image/") && !isHeic(raw)) || raw.size === 0) {
                    toast.error(`${raw.name}: please select a non-empty image file`)
                    continue
                }
                try {
                    const file = await ensureRenderable(raw)
                    if (!mounted.current) return
                    const url = URL.createObjectURL(file)
                    previewUrls.current.add(url)
                    setPendingPhotos(current => [...current, { id: crypto.randomUUID(), file, url }])
                } catch {
                    toast.error(`${raw.name}: could not prepare photo. Please choose another image.`)
                }
            }
        } finally {
            busy.current = false
            setPreparing(false)
            onBusyChange?.(false)
        }
    }

    const removePhoto = (id: string, url: string) => {
        URL.revokeObjectURL(url)
        previewUrls.current.delete(url)
        setPendingPhotos(current => current.filter(photo => photo.id !== id))
    }

    const [plannedMaintenance, setPlannedMaintenance] = useState(
        asset
            ? asset.pm_interval_months !== null || asset.next_service_date !== null
            : true
    )

    // Form State
    const [formData, setFormData] = useState({
        asset_group: asset?.asset_group || "external",
        asset_type_id: asset?.asset_type_id || "",
        install_date: asset?.install_date || "",
        status: asset?.status || "active",
        asset_details: asset?.asset_details || "",
        asset_dimensions: asset?.asset_dimensions || "",
        last_service_date: asset?.last_service_date || "",
        next_service_date: asset?.next_service_date || "",
        pm_interval_months: asset?.pm_interval_months ?? (asset ? null : 18),
    })

    useEffect(() => {
        async function fetchAssetTypes() {
            const { data } = await supabase
                .from("asset_types")
                .select("*")
                .order("label")

            setAssetTypes(data || [])
        }

        fetchAssetTypes()
    }, [supabase])

    const createAssetType = async () => {
        if (!isAdmin || busy.current) return
        const label = newTypeName.trim()
        if (!label) {
            setTypeError("Enter an asset type name.")
            return
        }
        const existing = assetTypes.find(type => type.label.trim().toLowerCase() === label.toLowerCase())
        if (existing) {
            setFormData(current => ({ ...current, asset_type_id: existing.id }))
            setAddingType(false)
            setNewTypeName("")
            setTypeError("")
            toast.success("Existing asset type selected")
            return
        }
        busy.current = true
        setTypeSaving(true)
        setTypeError("")
        onBusyChange?.(true)
        try {
            const { data, error } = await supabase.from("asset_types")
                .insert({ label, icon_name: "Package" })
                .select("*")
                .single()
            if (error) throw error
            if (!data) throw new Error("Could not create asset type. Please try again.")
            setAssetTypes(current => [...current, data as AssetType].sort((a, b) => a.label.localeCompare(b.label)))
            setFormData(current => ({ ...current, asset_type_id: data.id }))
            setAddingType(false)
            setNewTypeName("")
            toast.success("Asset type created and selected")
        } catch (error) {
            const message = error instanceof Error ? error.message : (error as { message?: string })?.message || "Could not create asset type. Please try again."
            setTypeError(message)
        } finally {
            busy.current = false
            setTypeSaving(false)
            onBusyChange?.(false)
        }
    }

    // Helper to calculate next service date using the selected PM interval,
    // rounded to the start of the relevant quarter.
    const calculateNextService = (
        installDate: string,
        intervalMonths = 18
    ) => {
        if (!installDate) return ""

        const date = new Date(installDate)
        date.setMonth(date.getMonth() + intervalMonths)

        const month = date.getMonth()
        const year = date.getFullYear()

        let targetMonth = 0 // Q1 (Jan)
        if (month >= 3 && month <= 5) targetMonth = 3 // Q2 (Apr)
        if (month >= 6 && month <= 8) targetMonth = 6 // Q3 (Jul)
        if (month >= 9 && month <= 11) targetMonth = 9 // Q4 (Oct)

        const roundedDate = new Date(year, targetMonth, 1)

        return roundedDate.toISOString().split("T")[0]
    }

    const getQuarterLabel = (dateString: string) => {
        if (!dateString) return ""

        const date = new Date(dateString)
        const month = date.getMonth()
        const year = date.getFullYear()
        const quarter = Math.floor(month / 3) + 1

        return `Q${quarter} ${year}`
    }

    const handleInstallDateChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const date = e.target.value

        setFormData((prev) => ({
            ...prev,
            install_date: date,
            next_service_date: plannedMaintenance
                ? calculateNextService(
                      date,
                      prev.pm_interval_months ?? 18
                  )
                : "",
        }))
    }

    const handlePlannedMaintenanceChange = (checked: boolean) => {
        setPlannedMaintenance(checked)

        setFormData((prev) => ({
            ...prev,
            pm_interval_months: checked
                ? prev.pm_interval_months ?? 18
                : null,
            next_service_date: checked
                ? calculateNextService(
                      prev.install_date,
                      prev.pm_interval_months ?? 18
                  )
                : "",
            last_service_date: checked
                ? prev.last_service_date
                : "",
        }))
    }

    const handlePmIntervalChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const value = e.target.value

        if (!value) {
            setFormData((prev) => ({
                ...prev,
                pm_interval_months: null,
                next_service_date: "",
            }))
            return
        }

        const months = Number(value)

        setFormData((prev) => ({
            ...prev,
            pm_interval_months: months,
            next_service_date: prev.install_date
                ? calculateNextService(prev.install_date, months)
                : "",
        }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (busy.current || addingType) return
        busy.current = true
        setLoading(true)
        onBusyChange?.(true)
        setSaveError("")
        try {

            const dataToValidate = {
                ...formData,
                pm_interval_months: plannedMaintenance
                    ? formData.pm_interval_months
                    : null,
                next_service_date: plannedMaintenance
                    ? formData.next_service_date
                    : "",
                last_service_date: plannedMaintenance
                    ? formData.last_service_date
                    : "",
            }

            const result = assetSchema.safeParse(dataToValidate)

            if (!result.success) {
                const errors = getValidationErrors(result)
                errors.forEach((msg) => toast.error(msg))
                return
            }

            const payload: Record<string, unknown> = {
                store_id: storeId,
                asset_group: formData.asset_group,
                asset_type_id: formData.asset_type_id,
                install_date: formData.install_date || null,
                status: formData.status,
                asset_details: formData.asset_details,
                asset_dimensions: formData.asset_dimensions,

                last_service_date: plannedMaintenance
                    ? formData.last_service_date || null
                    : null,

                next_service_date: plannedMaintenance
                    ? formData.next_service_date || null
                    : null,

                pm_interval_months: plannedMaintenance
                    ? formData.pm_interval_months
                    : null,
            }

            let savedId = asset?.id || createdAssetId
            if (asset?.id) {
                const { error: updateError } = await supabase
                    .from("assets")
                    .update(payload)
                    .eq("id", asset.id)

                if (updateError) throw updateError
            } else if (!savedId) {
                const { data, error: insertError } = await supabase
                    .from("assets")
                    .insert(payload)
                    .select("id")
                    .single()
                if (insertError) throw insertError
                savedId = data.id
                setCreatedAssetId(savedId)
            }

            let failed = false
            if (!asset && savedId) {
                for (const photo of pendingPhotos) {
                    try {
                        await uploadPendingAssetPhoto(supabase, savedId, photo.file, internalOnly, !hasThumbnail.current)
                        hasThumbnail.current = true
                        removePhoto(photo.id, photo.url)
                    } catch (error) {
                        failed = true
                        const message = error instanceof Error ? error.message : (error as { message?: string })?.message || "Upload failed"
                        setPendingPhotos(current => current.map(item => item.id === photo.id ? { ...item, error: message } : item))
                    }
                }
            }
            if (failed) {
                setSaveError("Asset created. Some photos could not be saved. Retry saving to upload the remaining photos, or remove them and finish. Your asset will not be created again.")
            } else {
                toast.success(
                    asset?.id
                        ? "Asset updated successfully"
                        : "Asset added successfully"
                )
                onSuccess()
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : (error as { message?: string })?.message || "Could not save asset. Please try again."
            setSaveError(message)
            toast.error(message)
        } finally {
            busy.current = false
            setLoading(false)
            onBusyChange?.(false)
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-6 py-4 font-primary"
        >
            <fieldset disabled={loading || preparing || typeSaving || !!createdAssetId} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label
                            htmlFor="asset_group"
                            className="text-xs font-medium text-muted-foreground"
                        >
                            Asset Group *
                        </Label>

                        <Select
                            value={formData.asset_group}
                            onValueChange={(v: string) =>
                                setFormData({
                                    ...formData,
                                    asset_group: v,
                                })
                            }
                        >
                            <SelectTrigger id="asset_group">
                                <SelectValue placeholder="Select group" />
                            </SelectTrigger>

                            <SelectContent>
                                <SelectItem value="external">
                                    External
                                </SelectItem>
                                <SelectItem value="internal">
                                    Internal
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid gap-2">
                        <Label
                            htmlFor="asset_type_id"
                            className="text-xs font-medium text-muted-foreground"
                        >
                            Asset Type *
                        </Label>

                        <Select
                            value={formData.asset_type_id}
                            onValueChange={(v) => {
                                if (v === "__create_asset_type__") {
                                    if (isAdmin) {
                                        setAddingType(true)
                                        setTypeError("")
                                    }
                                } else {
                                    setFormData(current => ({ ...current, asset_type_id: v }))
                                    setAddingType(false)
                                    setTypeError("")
                                }
                            }}
                        >
                            <SelectTrigger id="asset_type_id">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>

                            <SelectContent>
                                {isAdmin && <SelectItem value="__create_asset_type__">+ Create new asset type…</SelectItem>}
                                {assetTypes.map((type) => (
                                    <SelectItem
                                        key={type.id}
                                        value={type.id}
                                    >
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {addingType && isAdmin && <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                    <Label htmlFor="new-asset-type-name">New asset type name</Label>
                    <Input id="new-asset-type-name" placeholder="e.g. Digital menu board" value={newTypeName}
                        autoFocus aria-invalid={!!typeError} aria-describedby={typeError ? "asset-type-error" : undefined}
                        onChange={e => { setNewTypeName(e.target.value); setTypeError("") }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void createAssetType() } }} />
                    <p className="text-xs text-muted-foreground">This type will be available for assets at all sites.</p>
                    {typeError && <p id="asset-type-error" role="alert" className="text-sm text-destructive">{typeError}</p>}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" disabled={typeSaving} onClick={() => { setAddingType(false); setNewTypeName(""); setTypeError("") }}>Cancel new type</Button>
                        <Button type="button" disabled={typeSaving} onClick={() => void createAssetType()}>{typeSaving ? "Creating type…" : "Create type"}</Button>
                    </div>
                </div>}

                <div className="grid gap-2">
                    <Label
                        htmlFor="asset_dimensions"
                        className="text-xs font-medium text-muted-foreground"
                    >
                        Asset Dimensions
                    </Label>

                    <Input
                        id="asset_dimensions"
                        placeholder="e.g. 2400mm x 600mm"
                        value={formData.asset_dimensions}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                asset_dimensions: e.target.value,
                            })
                        }
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label
                            htmlFor="install_date"
                            className="text-xs font-medium text-muted-foreground"
                        >
                            Install Date
                        </Label>

                        <Input
                            id="install_date"
                            type="date"
                            value={formData.install_date}
                            onChange={handleInstallDateChange}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label
                            htmlFor="status"
                            className="text-xs font-medium text-muted-foreground"
                        >
                            Status
                        </Label>

                        <Select
                            value={formData.status}
                            onValueChange={(value) =>
                                setFormData({
                                    ...formData,
                                    status: value,
                                })
                            }
                        >
                            <SelectTrigger id="status">
                                <SelectValue />
                            </SelectTrigger>

                            <SelectContent>
                                <SelectItem value="active">
                                    Active
                                </SelectItem>
                                <SelectItem value="maintenance">
                                    Maintenance
                                </SelectItem>
                                <SelectItem value="inactive">
                                    Inactive
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="p-4 bg-muted/40 rounded-md border border-border/60 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                            <Label
                                htmlFor="planned_maintenance"
                                className="text-sm font-medium"
                            >
                                Planned maintenance required
                            </Label>

                            <p className="text-xs text-muted-foreground">
                                Enable if this asset requires recurring
                                scheduled servicing.
                            </p>
                        </div>

                        <Switch
                            id="planned_maintenance"
                            checked={plannedMaintenance}
                            onCheckedChange={
                                handlePlannedMaintenanceChange
                            }
                        />
                    </div>

                    {plannedMaintenance && (
                        <div className="grid grid-cols-2 gap-4 pt-1">
                            <div className="grid gap-1.5">
                                <Label
                                    htmlFor="pm_interval_months"
                                    className="text-xs font-medium text-muted-foreground"
                                >
                                    PM interval (months)
                                </Label>

                                <Input
                                    id="pm_interval_months"
                                    type="number"
                                    min={1}
                                    max={120}
                                    value={
                                        formData.pm_interval_months ?? ""
                                    }
                                    onChange={handlePmIntervalChange}
                                    className="h-9"
                                />
                            </div>

                            <div className="grid gap-1.5">
                                <Label
                                    htmlFor="next_service"
                                    className="text-xs font-medium text-muted-foreground"
                                >
                                    Next service target
                                </Label>

                                <div className="flex flex-col gap-1">
                                    <span className="text-sm font-medium text-foreground">
                                        {getQuarterLabel(
                                            formData.next_service_date
                                        ) || "—"}
                                    </span>

                                    <Input
                                        id="next_service"
                                        type="date"
                                        value={
                                            formData.next_service_date
                                        }
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                next_service_date:
                                                    e.target.value,
                                            })
                                        }
                                        className="h-7 text-xs"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {!plannedMaintenance && (
                        <p className="text-xs text-muted-foreground border-t border-border/60 pt-3">
                            No recurring service schedule will be set for
                            this asset.
                        </p>
                    )}
                </div>

                <div className="grid gap-2">
                    <Label
                        htmlFor="asset_details"
                        className="text-xs font-medium text-muted-foreground"
                    >
                        Asset Details (Free Format) *
                    </Label>

                    <Textarea
                        id="asset_details"
                        placeholder="e.g. Mounted on main pylon cabinet, requires cherry picker for access."
                        className="min-h-[100px]"
                        value={formData.asset_details}
                        onChange={(e) =>
                            setFormData({
                                ...formData,
                                asset_details: e.target.value,
                            })
                        }
                    />
                </div>

            </fieldset>
                {asset?.id ? (
                    <div className="pt-6 border-t">
                        <AssetPhotoGallery assetId={asset.id} />
                    </div>
                ) : (
                    <div className="space-y-3 rounded-md border border-dashed p-4"
                        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = loading || preparing || typeSaving ? "none" : "copy" }}
                        onDrop={e => { e.preventDefault(); void queuePhotos(Array.from(e.dataTransfer.files)) }}>
                        <Label htmlFor="new-asset-photos" className="flex items-center gap-2"><Camera className="size-3.5" />Asset photos (optional)</Label>
                        <p className="text-xs text-muted-foreground">Drop photos here or select files. Photos upload when you save the asset.</p>
                        <Input id="new-asset-photos" type="file" accept="image/*,.heic,.heif" multiple disabled={loading || preparing || typeSaving}
                            onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ""; void queuePhotos(files) }} />
                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={internalOnly} disabled={loading || preparing || typeSaving} onChange={e => setInternalOnly(e.target.checked)} />Service-team only</label>
                        {preparing && <p role="status" className="text-xs">Preparing photo previews…</p>}
                        <div className="grid grid-cols-3 gap-2">
                            {pendingPhotos.map(photo => <div key={photo.id} className="relative rounded-md border p-1">
                                {/* Local blob URLs are released on removal and unmount. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photo.url} alt={photo.file.name} className="aspect-square w-full rounded object-cover" />
                                <p className="truncate text-xs" title={photo.file.name}>{photo.file.name}</p>
                                <Button type="button" variant="secondary" size="icon" className="absolute right-1 top-1 size-7" aria-label={`Remove ${photo.file.name}`} disabled={loading || preparing || typeSaving} onClick={() => removePhoto(photo.id, photo.url)}><X className="size-4" /></Button>
                                {photo.error && <p role="alert" className="text-xs text-destructive">{photo.error}</p>}
                            </div>)}
                        </div>
                    </div>
                )}
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}

            <div className="flex justify-end gap-3 pt-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={createdAssetId ? onSuccess : onCancel}
                    disabled={loading || preparing || typeSaving}
                >
                    {createdAssetId ? "Close (asset already created)" : "Cancel"}
                </Button>

                <Button
                    type="submit"
                    disabled={loading || preparing || typeSaving || addingType}
                    className="min-w-[100px]"
                >
                    {loading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : createdAssetId ? (
                        "Finish saving"
                    ) : asset?.id ? (
                        "Save Changes"
                    ) : (
                        "Add Asset"
                    )}
                </Button>
            </div>
        </form>
    )
}
