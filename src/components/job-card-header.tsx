/* eslint-disable @next/next/no-img-element -- Print at fixed physical sizes; the QR URL is generated at runtime. */
// Keep printed documents on RPM's light-theme palette, including when the app is in dark mode.
export const PRINT_PRIMARY = "oklch(0.42 0.08 250)"
export const PRINT_TINT = "oklch(0.94 0.006 250)"

type JobHeaderProps = {
  number: string
  customer: string
  site: string
  title: string
  issued: string
  due: string
  contact: string
  phone: string
  qrUrl: string
  qrAlt?: string
}

function Detail({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return (
    <div className="grid min-w-0 grid-cols-[18mm_minmax(0,1fr)] items-start gap-[1mm]">
      <span className="pt-[.4mm] text-[9px] font-bold uppercase leading-[1.2] tracking-[.02em]" style={{ color: PRINT_PRIMARY }}>{label}</span>
      <span className={`min-w-0 break-words text-[12px] leading-[1.25] ${prominent ? "font-bold" : "font-medium"}`}>{value || "—"}</span>
    </div>
  )
}

export function JobCardHeader({ number, customer, site, title, issued, due, contact, phone, qrUrl, qrAlt = "RPM job QR code" }: JobHeaderProps) {
  return (
    <div className="grid min-h-[37mm] grid-cols-[21mm_minmax(0,1fr)_21mm_28mm] items-stretch gap-[2mm] border p-[2mm]" style={{ borderColor: PRINT_PRIMARY, background: PRINT_TINT }}>
      <div className="flex items-center justify-center bg-white">
        <img src="/R-2025.svg" alt="Rodier" className="h-[19mm] w-[19mm] object-contain" />
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-[1.3mm] bg-white px-[2mm] py-[1.5mm] text-[#1d2732]">
        <Detail label="Client" value={customer} prominent />
        <Detail label="Job title" value={title} prominent />
        <Detail label="Site" value={site} />
        <div className="grid grid-cols-2 gap-[2mm]">
          <Detail label="Contact" value={contact} />
          <Detail label="Phone" value={phone} />
        </div>
        <div className="grid grid-cols-2 gap-[2mm]">
          <Detail label="Issued" value={issued} />
          <Detail label="Required" value={due} />
        </div>
      </div>

      <div className="flex flex-col items-center justify-center bg-white">
        {qrUrl ? <img src={qrUrl} alt={qrAlt} className="h-[18mm] w-[18mm]" /> : <div className="h-[18mm] w-[18mm] border border-black" />}
        <div className="mt-[.8mm] text-center text-[7.4px] leading-none">Scan to view in RPM</div>
      </div>

      <div className="flex flex-col items-center justify-center border-l bg-white px-[1mm]" style={{ borderColor: PRINT_PRIMARY }}>
        <div className="text-[9px] font-bold leading-none">Job No.</div>
        <div className="mt-[1mm] whitespace-nowrap font-black leading-none tracking-tight" style={{ color: PRINT_PRIMARY, fontSize: number.length <= 4 ? "36px" : number.length <= 6 ? "30px" : "25px" }}>
          {number}
        </div>
      </div>
    </div>
  )
}
