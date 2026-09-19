import { StatementUploader } from "@/components/upload/StatementUploader";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Upload a statement</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a bank or credit card statement (PDF/CSV), or paste transaction text directly.
          Subs-Guard uses AI to extract vendor names, billing cycles, and charge amounts.
        </p>
      </div>
      <StatementUploader />
    </div>
  );
}
