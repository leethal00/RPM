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

export function SiteConstructionSet({
    storeId,
}: SiteConstructionSetProps) {
    const supabase = useMemo(() => createClient(), [])

    const [drawings, setDrawings] = useState<SiteConstructionDrawing[]>([])
    const [loading, setLoading] = useState(true)
    const [available, setAvailable] = useState(true)

    const [dialogOpen, setDialogOpen] = useState(false)
    const [uploading, setUploading] = useState(false)

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

        const isPdf =
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf")

        if (!isPdf) {
            toast.error("Please select a PDF file.")
            event.target.value = ""
            setSelectedFile(null)
            return
        }

        setSelectedFile(file)
    }

    const handleUpload = async (
        event: React.FormEvent<HTMLFormElement>
    ) => {
        event.preventDefault()

        const number = drawingNumber.trim()
        const title = drawingTitle.trim()

        if (!number) {
            toast.error("Enter a drawing number.")
            return
        }

        if (!title) {
            toast.error("Enter a drawing title.")
            return
        }

        if (!selectedFile) {
            toast.error("Select a PDF drawing.")
            return
        }

        setUploading(true)

        let uploadedPath: string | null = null

        try {
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser()

            if (userError || !user) {
                throw new Error("You must be logged in to upload drawings.")
            }

            const safeName = selectedFile.name
                .replace(/[^a-zA-Z0-9._-]/g, "_")

            const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`

            uploadedPath = `${storeId}/${uniqueName}`

            const { error: uploadError } = await supabase.storage
                .from(STORAGE_BUCKET)
                .upload(uploadedPath, selectedFile, {
                    contentType: "application/pdf",
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
                    file_name: selectedFile.name,
                    uploaded_by: user.id,
                })

            if (insertError) {
                await supabase.storage
                    .from(STORAGE_BUCKET)
                    .remove([uploadedPath])

                throw insertError
            }

            toast.success("Drawing added.")

            setDialogOpen(false)
            resetForm()
            await fetchDrawings()
        } catch (error) {
            console.error("Drawing upload failed:", error)

            const message =
                error instanceof Error
                    ? error.message
                    : "Could not upload the drawing."

            toast.error(message)
        } finally {
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
                        Construction Drawings
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                        Final construction drawing sheets relevant to this site.
                    </p>
                </div>

                <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={!available}
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
                        Construction drawing storage is not active yet
                    </p>

                    <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
                        The Construction Drawings interface is ready. Drawing uploads
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

            {available && !loading && drawings.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/60 py-14 text-center">
                    <FileText className="mx-auto mb-3 size-8 text-muted-foreground/40" />

                    <p className="text-sm font-medium">
                        No construction drawings uploaded yet
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                        Add the individual PDF sheets from the final construction drawings.
                    </p>
                </div>
            )}

            {available && !loading && drawings.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                    <div className="grid grid-cols-[minmax(130px,0.7fr)_minmax(250px,2fr)_minmax(180px,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        <div>Drawing No.</div>
                        <div>Drawing Title</div>
                        <div>File</div>
                        <div className="text-right">Actions</div>
                    </div>

                    {drawings.map((drawing) => (
                        <div
                            key={drawing.id}
                            className="grid grid-cols-[minmax(130px,0.7fr)_minmax(250px,2fr)_minmax(180px,1fr)_auto] items-center gap-4 border-b px-4 py-3 last:border-b-0"
                        >
                            <div className="font-mono text-sm font-medium">
                                {drawing.drawing_number}
                            </div>

                            <div className="min-w-0 text-sm">
                                {drawing.drawing_title}
                            </div>

                            <div
                                className="truncate text-xs text-muted-foreground"
                                title={drawing.file_name}
                            >
                                {drawing.file_name}
                            </div>

                            <div className="flex items-center justify-end gap-1">
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
                        <DialogTitle>Add Construction Drawing</DialogTitle>
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
                                PDF Drawing
                            </Label>

                            <Input
                                ref={fileInputRef}
                                id="construction-drawing-file"
                                type="file"
                                accept=".pdf,application/pdf"
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
