"use client";

import React from "react";
import { Send } from "lucide-react";
import { ClientDeliveryProtocol, StepSchemaField } from "@workspace/canvas/types";

export interface PushToClientPayloadMappingProps {
  protocol: ClientDeliveryProtocol;
  incomingSchemaFields: StepSchemaField[];
  onForwardWholePayload: () => void;
  onMapAllSchemaFields: () => void;
}

export const PushToClientPayloadMapping: React.FC<PushToClientPayloadMappingProps> = ({
  protocol,
  incomingSchemaFields,
  onForwardWholePayload,
  onMapAllSchemaFields,
}) => {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/20 p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Send size={12} className="text-primary" />
          <span className="text-[11px] font-semibold text-foreground/90">
            Client Delivery Payload
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground/70">
          {protocol === "SSE"
            ? "Sent in SSE data envelope"
            : protocol === "WEBSOCKET"
            ? "Sent in WebSocket packet"
            : "Sent in payload"}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
        Configure the payload data forwarded to the client. You can forward the entire event payload or map individual schema fields below.
      </p>

      {incomingSchemaFields.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/30">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Available Schema Fields ({incomingSchemaFields.length})
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-medium cursor-pointer"
                onClick={onForwardWholePayload}
                title="Forward the entire incoming payload object without reshaping"
              >
                Forward Whole Payload
              </button>
              <span className="text-[10px] text-muted-foreground/40">•</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-medium cursor-pointer"
                onClick={onMapAllSchemaFields}
                title="Map each incoming schema field to a separate argument binding"
              >
                Map All Schema Fields
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {incomingSchemaFields.map((f) => (
              <span
                key={f.name}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-background border border-border/60 text-foreground/80"
              >
                <span className="font-semibold text-primary">{f.name}</span>
                {f.type && (
                  <span className="text-muted-foreground/60 text-[8px]">:{f.type}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
