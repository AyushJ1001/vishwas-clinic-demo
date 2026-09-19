"use client";

import { Receipt } from "@phosphor-icons/react";
import { useState } from "react";

import { A5Document, RouteWorkspace } from "./a5-workspace";
import { RouteHeader, Shell } from "./shell";

export function ReceiptPage() {
  const [amount, setAmount] = useState("600");
  const [patientName, setPatientName] = useState("");
  return (
    <Shell active="receipts">
      <RouteHeader
        eyebrow="Consultation payment"
        title="Receipt, without rewriting the visit."
        copy="Patient, doctor, clinic identity, date, and receipt number are carried forward automatically."
      />
      <RouteWorkspace
        form={
          <>
            <label>
              <span className="field-label">Patient</span>
              <input
                className="input-field"
                value={patientName}
                onChange={(event) => setPatientName(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Receipt number</span>
              <input
                className="input-field"
                defaultValue="VC-R-0862"
                readOnly
              />
            </label>
            <label>
              <span className="field-label">Consultation amount</span>
              <input
                className="input-field"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <button className="primary-action">
              <Receipt size={18} /> Generate and print receipt
            </button>
          </>
        }
        preview={
          <A5Document title="RECEIPT">
            <p className="mt-12 text-center text-sm leading-9">
              Received with thanks a sum of rupees <b>₹{amount || "0"}</b> from{" "}
              <b>Ms. {patientName || "—"}</b> for consultation charges today.
            </p>
            <div className="mt-20 flex justify-between border-t pt-4 text-xs">
              <span>Receipt VC-R-0862</span>
              <span>Dr. Makarand V. Apte</span>
            </div>
          </A5Document>
        }
      />
    </Shell>
  );
}

