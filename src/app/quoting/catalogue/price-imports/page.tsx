import Link from "next/link"
import DashboardLayout from "@/components/dashboard-layout"
import { PageShell } from "@/components/page-shell"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { ArrowLeft, FileSpreadsheet } from "lucide-react"

export default function SupplierPriceImportsPage() {
    return (
        <DashboardLayout>
            <PageShell>
                <PageHeader
                    icon={FileSpreadsheet}
                    kicker="Catalogue"
                    title="Supplier Price Imports"
                    description="Upload supplier price lists and update existing RPM catalogue items."
                    actions={(
                        <Button variant="outline" asChild>
                            <Link href="/quoting/catalogue">
                                <ArrowLeft className="mr-1.5 size-4" />
                                Catalogue
                            </Link>
                        </Button>
                    )}
                />

                <div className="mt-5 rounded-lg border border-dashed bg-card px-6 py-12 text-center">
                    <FileSpreadsheet className="mx-auto mb-3 size-8 text-muted-foreground" />
                    <div className="text-sm font-medium">Supplier price import</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        The importer will be added here in verified stages. It will update existing RPM catalogue items only.
                    </p>
                </div>
            </PageShell>
        </DashboardLayout>
    )
}
