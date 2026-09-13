"use client";

import React from "react";
import { Mic, Volume2, Video, Monitor, Tv, Radio } from "lucide-react";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { WebRtcCapabilities } from "@workspace/canvas/types";
import { WEBRTC_CAPABILITIES_DEBOUNCE_MS } from "@workspace/canvas/constants";
import { PipelineStepDraft } from "./types";
import { resolveCapabilitiesFromStep, computeMediaMode } from "./pushToClientUtils";

export interface WebRtcCapabilitiesEditorProps {
  step: PipelineStepDraft;
  onCommit: (patch: Partial<PipelineStepDraft>) => void;
}

export const WebRtcCapabilitiesEditor: React.FC<WebRtcCapabilitiesEditorProps> = ({
  step,
  onCommit,
}) => {
  const [caps, setCaps] = React.useState<WebRtcCapabilities>(() =>
    resolveCapabilitiesFromStep(step),
  );
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const latestCapsRef = React.useRef(caps);
  latestCapsRef.current = caps;
  const onCommitRef = React.useRef(onCommit);
  onCommitRef.current = onCommit;

  React.useEffect(() => {
    if (!timeoutRef.current) {
      setCaps(resolveCapabilitiesFromStep(step));
    }
  }, [
    step.id,
    step.clientDeliveryEnableDataChannel,
    step.clientDeliveryEnableMic,
    step.clientDeliveryEnableSpeaker,
    step.clientDeliveryEnableCamera,
    step.clientDeliveryEnableScreenShare,
    step.clientDeliveryEnableRemoteVideo,
    step.clientDeliveryMediaMode,
    step.clientDeliveryEnableAudio,
    step.clientDeliveryEnableVideo,
  ]);

  const commit = React.useCallback((values: WebRtcCapabilities) => {
    const computedMediaMode = computeMediaMode(values);

    onCommitRef.current({
      clientDeliveryEnableDataChannel: values.enableDataChannel,
      clientDeliveryEnableMic: values.enableMic,
      clientDeliveryEnableSpeaker: values.enableSpeaker,
      clientDeliveryEnableCamera: values.enableCamera,
      clientDeliveryEnableScreenShare: values.enableScreenShare,
      clientDeliveryEnableRemoteVideo: values.enableRemoteVideo,
      clientDeliveryEnableAudio: values.enableMic,
      clientDeliveryEnableVideo: values.enableCamera,
      clientDeliveryMediaMode: computedMediaMode,
    });
  }, []);

  const handleToggle = (capKey: keyof WebRtcCapabilities, checked: boolean) => {
    setCaps((prev) => {
      const next = { ...prev, [capKey]: checked };
      latestCapsRef.current = next;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        commit(next);
      }, WEBRTC_CAPABILITIES_DEBOUNCE_MS);
      return next;
    });
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        commit(latestCapsRef.current);
      }
    };
  }, [commit]);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        WebRTC Capabilities
      </span>

      {/* Data Channel */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`step-${step.id}-dc`}
          checked={caps.enableDataChannel}
          onCheckedChange={(val) => handleToggle("enableDataChannel", Boolean(val))}
        />
        <label
          htmlFor={`step-${step.id}-dc`}
          className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
        >
          <Radio size={12} className="text-violet-500" />
          <span>Data Channel (JSON)</span>
        </label>
      </div>

      <div className="h-px bg-border/40" />
      <span className="text-[9px] font-mono font-semibold uppercase text-muted-foreground/70">
        Audio
      </span>

      {/* Microphone */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`step-${step.id}-mic`}
          checked={caps.enableMic}
          onCheckedChange={(val) => handleToggle("enableMic", Boolean(val))}
        />
        <label
          htmlFor={`step-${step.id}-mic`}
          className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
        >
          <Mic size={12} className="text-emerald-500" />
          <span>Microphone (Send Audio)</span>
        </label>
      </div>

      {/* Speaker */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`step-${step.id}-speaker`}
          checked={caps.enableSpeaker}
          onCheckedChange={(val) => handleToggle("enableSpeaker", Boolean(val))}
        />
        <label
          htmlFor={`step-${step.id}-speaker`}
          className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
        >
          <Volume2 size={12} className="text-teal-500" />
          <span>Speaker (Receive Audio)</span>
        </label>
      </div>

      <div className="h-px bg-border/40" />
      <span className="text-[9px] font-mono font-semibold uppercase text-muted-foreground/70">
        Video
      </span>

      {/* Camera */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`step-${step.id}-camera`}
          checked={caps.enableCamera}
          onCheckedChange={(val) => handleToggle("enableCamera", Boolean(val))}
        />
        <label
          htmlFor={`step-${step.id}-camera`}
          className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
        >
          <Video size={12} className="text-blue-500" />
          <span>Camera (Send Video)</span>
        </label>
      </div>

      {/* Screen Share */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`step-${step.id}-screen`}
          checked={caps.enableScreenShare}
          onCheckedChange={(val) => handleToggle("enableScreenShare", Boolean(val))}
        />
        <label
          htmlFor={`step-${step.id}-screen`}
          className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
        >
          <Monitor size={12} className="text-indigo-500" />
          <span>Screen Share (Send Display)</span>
        </label>
      </div>

      {/* Remote Video */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`step-${step.id}-remote-vid`}
          checked={caps.enableRemoteVideo}
          onCheckedChange={(val) => handleToggle("enableRemoteVideo", Boolean(val))}
        />
        <label
          htmlFor={`step-${step.id}-remote-vid`}
          className="text-xs font-medium text-foreground flex items-center gap-1.5 cursor-pointer"
        >
          <Tv size={12} className="text-purple-500" />
          <span>Remote Video (Receive Video)</span>
        </label>
      </div>
    </div>
  );
};
