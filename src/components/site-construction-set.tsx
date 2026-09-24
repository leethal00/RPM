"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
    ExternalLink,
    FileText,
    Loader2,
    Plus,
    Trash2,
    UploadCloud,
} from "lucide-react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

import type { SiteConstructionDrawing } from "@/types/database"

interface SiteConstructionSetProps {
    storeId: string
}

const STORAGE_BUCKET = "construction-drawings"
const DROP_FILE_TYPES: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
}

function drawingFileType(file: File): string | null {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
    const type = DROP_FILE_TYPES[extension]
    return type && (!file.type || file.type === "application/octet-stream" || file.type === type) ? type : null
}

export function SiteConstructionSet({
    storeId,
}: SiteConstructionSetProps) {
    const supabase = useMemo(() => createClient(), [])

    const [drawings, setDrawings] = useState<SiteConstructionDrawing[]>([])
    const [loading, setLoading] = useState(true)
    const [available, setAvailable] = useState(true)

    const [dialogOpen, setDialogOpen] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState("")
    const [dragOver, setDragOver] = useState(false)
    const dragDepth = useRef(0)

    const [drawingNumber, setDrawingNumber] = useState("")
    const [drawingTitle, setDrawingTitle] = useState("")
    const [selectedFile, setSelectedFile] = useState<File | null>(null)

    const fileInputRef = useRef<HTMLInputElement | null>(null)

    const fetchDrawings = async () => {
        setLoading(true)

        const { data, error } = await supabase
            .from("site_construction_drawings")
            .select("*")
            .eq("store_id", storeId)
            .order("drawing_number", { ascending: true })

        if (error) {
            console.warn(
                "Construction drawings are not available yet:",
                error.message
            )

            setAvailable(false)
            setDrawings([])
            setLoading(false)
            return
        }

        setAvailable(true)
        setDrawings((data ?? []) as SiteConstructionDrawing[])
        setLoading(false)
    }

    useEffect(() => {
        // Loading the current site's records is the purpose of this effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchDrawings()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeId])

    const resetForm = () => {
        setDrawingNumber("")
        setDrawingTitle("")
        setSelectedFile(null)

        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const closeDialog = () => {
        if (uploading) return

        setDialogOpen(false)
        resetForm()
    }

    const handleFileChange = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0] ?? null

        if (!file) {
            setSelectedFile(null)
            return
        }

        if (!drawingFileType(file)) {
            toast.error("Please select a PDF, PNG, JPG, WebP or GIF file.")
            event.target.value = ""
            setSelectedFile(null)
            return
        }

        setSelectedFile(file)
    }

    const uploadDrawing = async (file: File, number: string, title: string, userId: string) => {
        let uploadedPath: string | null = null
        try {
            const safeName = file.name
                .replace(/[^a-zA-Z0-9._-]/g, "_")

            const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`

            uploadedPath = `${storeId}/${uniqueName}`

            const { error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(uploadedPath, file, {
                    contentType: drawingFileType(file) ?? "application/pdf",
                    upsert: false,
                })

            if (uploadError) {
                throw uploadError
            }

            const { error: insertError } = await supabase
                .from("site_construction_drawings")
                .insert({
                    store_id: storeId,
                    drawing_number: number,
                    drawing_title: title,
                    file_url: uploadedPath,
                    file_name: file.name,
                    uploaded_by: userId,
                })

            if (insertError) {
                await supabase.storage
                    .from(STORAGE_BUCKET)
                    .remove([uploadedPath])

                throw insertError
            }

        } catch (error) {
            console.error("Drawing upload failed:", error)
            throw error
        }
    }

    const getUploadUserId = async () => {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) throw new Error("You must be logged in to upload drawings.")
        return user.id
    }

    const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const number = drawingNumber.trim()
        const title = drawingTitle.trim()
        if (!number) return toast.error("Enter a drawing number.")
        if (!title) return toast.error("Enter a drawing title.")
        if (!selectedFile) return toast.error("Select a drawing file.")

        setUploading(true)
        try {
            await uploadDrawing(selectedFile, number, title, await getUploadUserId())
            toast.success("Drawing added.")
            setDialogOpen(false)
            resetForm()
            await fetchDrawings()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not upload the drawing.")
        } finally {
            setUploading(false)
        }
    }

    const handleDroppedFiles = async (files: File[]) => {
        if (uploading || !available || files.length === 0) return
        const valid = files.filter((file) => drawingFileType(file))
        const rejected = files.length - valid.length
        if (rejected) toast.error(`${rejected} file${rejected === 1 ? "" : "s"} skipped. Use PDF, PNG, JPG, WebP or GIF files.`)
        if (!valid.length) return

        setUploading(true)
        let succeeded = 0
        const failed: string[] = []
        const usedNumbers = new Set(drawings.map((drawing) => drawing.drawing_number.toLowerCase()))
        try {
            const userId = await getUploadUserId()
            for (const [index, file] of valid.entries()) {
                setUploadProgress(`Uploading ${index + 1} of ${valid.length}: ${file.name}`)
                const title = file.name.replace(/\.[^.]+$/, "").trim() || "Drawing"
                let number = title
                let suffix = 2
                while (usedNumbers.has(number.toLowerCase())) number = `${title}-${suffix++}`
                try {
                    await uploadDrawing(file, number, title, userId)
                    usedNumbers.add(number.toLowerCase())
                    succeeded++
                } catch {
                    failed.push(file.name)
                }
            }
            if (succeeded) {
                await fetchDrawings()
                toast.success(`${succeeded} drawing${succeeded === 1 ? "" : "s"} added.`)
            }
            if (failed.length) toast.error(`Could not upload: ${failed.join(", ")}`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not upload the drawings.")
        } finally {
            setUploadProgress("")
            setUploading(false)
        }
    }

    const openDrawing = async (
        drawing: SiteConstructionDrawing
    ) => {
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(drawing.file_url, 60 * 10)

        if (error || !data?.signedUrl) {
            console.error("Could not open drawing:", error)
            toast.error("Could not open this drawing.")
            return
        }

        window.open(
            data.signedUrl,
            "_blank",
            "noopener,noreferrer"
        )
    }

    const deleteDrawing = async (
        drawing: SiteConstructionDrawing
    ) => {
        const confirmed = window.confirm(
            `Delete ${drawing.drawing_number} – ${drawing.drawing_title}?`
        )

        if (!confirmed) return

        const { error: deleteRecordError } = await supabase
            .from("site_construction_drawings")
            .delete()
            .eq("id", drawing.id)

        if (deleteRecordError) {
            console.error(
                "Could not delete drawing record:",
                deleteRecordError
            )
            toast.error("Could not delete the drawing.")
            return
        }

        const { error: deleteFileError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([drawing.file_url])

        if (deleteFileError) {
            console.warn(
                "Drawing record deleted, but file cleanup failed:",
                deleteFileError
            )
        }

        toast.success("Drawing deleted.")
        await fetchDrawings()
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold">
                        Drawings
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                        Final construction drawing sheets relevant to this site.
                    </p>
                </div>

                <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={!available || uploading}
                    onClick={() => setDialogOpen(true)}
                >
                    <Plus className="size-3.5" />
                    Add Drawing
                </Button>
            </div>

            {!available && (
                <div className="rounded-lg border border-dashed border-border/60 px-6 py-12 text-center">
                    <FileText className="mx-auto mb-3 size-8 text-muted-foreground/40" />

                    <p className="text-sm font-medium">
                        Drawing storage is not active yet
                    </p>

                    <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
                        The Drawings interface is ready. Drawing uploads
                        will become available once the Supabase construction
                        drawing migrations are applied.
                    </p>
                </div>
            )}

            {available && loading && (
                <div className="flex items-center justify-center py-14">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
            )}

            {available && !loading && (
                <div
                    aria-label="Drawings upload area"
                    className={`relative rounded-lg border border-dashed transition-colors ${dragOver ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border/60"}`}
                    onDragEnter={(event) => {
                        if (!Array.from(event.dataTransfer.types).includes("Files")) return
                        event.preventDefault()
                        dragDepth.current++
                        setDragOver(true)
                    }}
                    onDragOver={(event) => {
                        if (!Array.from(event.dataTransfer.types).includes("Files")) return
                        event.preventDefault()
                        event.dataTransfer.dropEffect = "copy"
                    }}
                    onDragLeave={(event) => {
                        event.preventDefault()
                        dragDepth.current = Math.max(0, dragDepth.current - 1)
                        if (dragDepth.current === 0) setDragOver(false)
                    }}
                    onDrop={(event) => {
                        event.preventDefault()
                        dragDepth.current = 0
                        setDragOver(false)
                        void handleDroppedFiles(Array.from(event.dataTransfer.files))
                    }}
                >
                    {dragOver && (
                        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/90 text-center text-sm font-semibold text-primary">
                            Drop PDF or image drawings here
                        </div>
                    )}
                    {drawings.length === 0 ? (
                        <div className="py-14 text-center">
                            <FileText className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                            <p className="text-sm font-medium">No drawings uploaded yet</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Drop PDF or image files here, or use Add Drawing.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-lg">
                            <div className="border-b px-4 py-2.5 text-center text-xs text-muted-foreground">
                                Drop PDF or image files here to add drawings
                            </div>
                            <div className="hidden grid-cols-[minmax(100px,0.7fr)_minmax(180px,2fr)_minmax(120px,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
                                <div>Drawing No.</div>
                                <div>Drawing Title</div>
                                <div>File</div>
                                <div className="text-right">Actions</div>
                            </div>

                            {drawings.map((drawing) => (
                                <div
                                    key={drawing.id}
                                    className="grid grid-cols-1 items-center gap-2 border-b px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(100px,0.7fr)_minmax(180px,2fr)_minmax(120px,1fr)_auto] lg:gap-4"
                                >
                                    <div className="font-mono text-sm font-medium">
                                        {drawing.drawing_number}
                                    </div>

                                    <div className="min-w-0 break-words text-sm">
                                        {drawing.drawing_title}
                                    </div>

                                    <div
                                        className="truncate text-xs text-muted-foreground"
                                        title={drawing.file_name}
                                    >
                                        {drawing.file_name}
                                    </div>

                                    <div className="flex items-center gap-1 lg:justify-end">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() => openDrawing(drawing)}
                                        >
                                            <ExternalLink className="size-3.5" />
                                            Open
                                        </Button>

                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8 text-muted-foreground hover:text-destructive"
                                            title="Delete drawing"
                                            onClick={() => deleteDrawing(drawing)}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {uploading && uploadProgress && (
                        <div role="status" className="border-t px-4 py-2 text-sm text-muted-foreground">
                            {uploadProgress}
                        </div>
                    )}
                </div>
            )}

            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (open) {
                        setDialogOpen(true)
                    } else {
                        closeDialog()
                    }
                }}
            >
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Add Drawing</DialogTitle>
                    </DialogHeader>

                    <form
                        onSubmit={handleUpload}
                        className="space-y-5 pt-2"
                    >
                        <div className="space-y-2">
                            <Label htmlFor="construction-drawing-number">
                                Drawing Number
                            </Label>

                            <Input
                                id="construction-drawing-number"
                                value={drawingNumber}
                                onChange={(event) =>
                                    setDrawingNumber(event.target.value)
                                }
                                placeholder="e.g. A101"
                                disabled={uploading}
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="construction-drawing-title">
                                Drawing Title
                            </Label>

                            <Input
                                id="construction-drawing-title"
                                value={drawingTitle}
                                onChange={(event) =>
                                    setDrawingTitle(event.target.value)
                                }
                                placeholder="e.g. Site Plan"
                                disabled={uploading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="construction-drawing-file">
                                Drawing File
                            </Label>

                            <Input
                                ref={fileInputRef}
                                id="construction-drawing-file"
                                type="file"
                                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/png,image/jpeg,image/webp,image/gif"
                                onChange={handleFileChange}
                                disabled={uploading}
                            />

                            {selectedFile && (
                                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                                    <FileText className="size-4 shrink-0 text-muted-foreground" />

                                    <span className="min-w-0 flex-1 truncate text-xs">
                                        {selectedFile.name}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={closeDialog}
                                disabled={uploading}
                            >
                                Cancel
                            </Button>

                            <Button
                                type="submit"
                                disabled={uploading}
                                className="gap-1.5"
                            >
                                {uploading ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                    <UploadCloud className="size-3.5" />
                                )}

                                {uploading
                                    ? "Uploading..."
                                    : "Add Drawing"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    )
}
