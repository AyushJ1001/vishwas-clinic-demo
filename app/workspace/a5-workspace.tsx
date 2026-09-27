"use client";

export function RouteWorkspace({
  form,
  preview,
}: {
  form: React.ReactNode;
  preview: React.ReactNode;
}) {
  return (
    <div className="rx-workspace">
      <div className="min-w-0">{form}</div>
      <div className="preview-wrap min-w-0">{preview}</div>
    </div>
  );
}
