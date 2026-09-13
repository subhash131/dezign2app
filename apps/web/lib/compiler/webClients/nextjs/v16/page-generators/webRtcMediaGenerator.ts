import type { LinkedRealtimeConnectionInfo } from "../types";

export interface WebRtcMediaCapabilities {
  hasMic: boolean;
  hasSpeaker: boolean;
  hasCamera: boolean;
  hasScreenShare: boolean;
  hasRemoteVideo: boolean;
  hasMediaStream: boolean;
}

export function resolveWebRtcMediaCapabilities(
  webrtcConnections: LinkedRealtimeConnectionInfo[],
): WebRtcMediaCapabilities {
  const activeMediaConns = webrtcConnections.filter((c) => c.mediaMode !== "data");
  const hasMic = activeMediaConns.some(
    (c) =>
      c.enableMic === true ||
      (c.enableMic === undefined &&
        (c.enableAudio === true || c.mediaMode === "audio" || c.mediaMode === "audio-video")),
  );
  const hasSpeaker = activeMediaConns.some(
    (c) =>
      c.enableSpeaker === true ||
      (c.enableSpeaker === undefined && (c.mediaMode === "audio" || c.mediaMode === "audio-video")),
  );
  const hasCamera = activeMediaConns.some(
    (c) =>
      c.enableCamera === true ||
      (c.enableCamera === undefined &&
        (c.enableVideo === true || c.mediaMode === "video" || c.mediaMode === "audio-video")),
  );
  const hasScreenShare = activeMediaConns.some((c) => c.enableScreenShare === true);
  const hasRemoteVideo = activeMediaConns.some(
    (c) =>
      c.enableRemoteVideo === true ||
      (c.enableRemoteVideo === undefined &&
        (c.enableVideo === true || c.mediaMode === "video" || c.mediaMode === "audio-video")),
  );
  const hasMediaStream = hasMic || hasSpeaker || hasCamera || hasScreenShare || hasRemoteVideo;

  return {
    hasMic,
    hasSpeaker,
    hasCamera,
    hasScreenShare,
    hasRemoteVideo,
    hasMediaStream,
  };
}

export function generateMediaStateJsx(
  capabilitiesOrHasMedia: WebRtcMediaCapabilities | boolean,
): string {
  const caps: WebRtcMediaCapabilities =
    typeof capabilitiesOrHasMedia === "boolean"
      ? {
          hasMic: capabilitiesOrHasMedia,
          hasSpeaker: capabilitiesOrHasMedia,
          hasCamera: capabilitiesOrHasMedia,
          hasScreenShare: capabilitiesOrHasMedia,
          hasRemoteVideo: capabilitiesOrHasMedia,
          hasMediaStream: capabilitiesOrHasMedia,
        }
      : capabilitiesOrHasMedia;

  if (!caps.hasMediaStream) return "";
  const { hasMic, hasSpeaker, hasCamera, hasScreenShare, hasRemoteVideo } = caps;

  return `  ${hasCamera || hasScreenShare ? "const localVideoRef = useRef<HTMLVideoElement | null>(null);\n  " : ""}${hasScreenShare ? "const screenVideoRef = useRef<HTMLVideoElement | null>(null);\n  const screenStreamRef = useRef<MediaStream | null>(null);\n  " : ""}${hasRemoteVideo ? "const remoteVideoRef = useRef<HTMLVideoElement | null>(null);\n  " : ""}${hasSpeaker ? "const remoteAudioRef = useRef<HTMLAudioElement | null>(null);\n  " : ""}${hasMic || hasCamera ? "const localMediaStreamRef = useRef<MediaStream | null>(null);\n  " : ""}const pcRef = useRef<RTCPeerConnection | null>(null);
  const [mediaActive, setMediaActive] = useState<boolean>(false);
  ${hasMic ? "const [mediaMuted, setMediaMuted] = useState<boolean>(false);\n  " : ""}${hasSpeaker ? "const [speakerMuted, setSpeakerMuted] = useState<boolean>(false);\n  " : ""}${hasCamera ? "const [cameraOff, setCameraOff] = useState<boolean>(false);\n  " : ""}${hasScreenShare ? "const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);\n  " : ""}${hasRemoteVideo ? "const [remoteVideoOff, setRemoteVideoOff] = useState<boolean>(false);\n  " : ""}const [mediaError, setMediaError] = useState<string | null>(null);

`;
}

export function generateMediaSectionJsx(capabilities: WebRtcMediaCapabilities): string {
  if (!capabilities.hasMediaStream) return "";
  const { hasMic, hasSpeaker, hasCamera, hasScreenShare, hasRemoteVideo } = capabilities;

  return `        {/* Section: WebRTC Live Media */}
        <Card className="border-border shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg font-bold text-card-foreground">WebRTC Live Media</CardTitle>
              <Badge variant="outline" className="text-xs flex items-center gap-1.5 font-mono text-purple-600 dark:text-purple-400 border-purple-500/30 bg-purple-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" /> {mediaActive ? "Live Stream Active" : "Connecting Media..."}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
                ${hasMic ? `<Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const stream = localMediaStreamRef.current;
                    if (stream) {
                      const audioTrack = stream.getAudioTracks()[0];
                      if (audioTrack) {
                        audioTrack.enabled = !audioTrack.enabled;
                        setMediaMuted(!audioTrack.enabled);
                      }
                    }
                  }}
                  className="text-xs"
                >
                  {mediaMuted ? "Unmute Mic" : "Mute Mic"}
                </Button>` : ""}
                ${hasSpeaker ? `<Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (remoteAudioRef.current) {
                      remoteAudioRef.current.muted = !remoteAudioRef.current.muted;
                      setSpeakerMuted(remoteAudioRef.current.muted);
                    }
                    if (remoteVideoRef.current) {
                      remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
                      setSpeakerMuted(remoteVideoRef.current.muted);
                    }
                  }}
                  className="text-xs"
                >
                  {speakerMuted ? "Unmute Speaker" : "Mute Speaker"}
                </Button>` : ""}
                ${hasCamera ? `<Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const stream = localMediaStreamRef.current;
                    if (stream) {
                      const videoTrack = stream.getVideoTracks()[0];
                      if (videoTrack) {
                        videoTrack.enabled = !videoTrack.enabled;
                        setCameraOff(!videoTrack.enabled);
                      }
                    }
                  }}
                  className="text-xs"
                >
                  {cameraOff ? "Start Camera" : "Stop Camera"}
                </Button>` : ""}
                ${hasScreenShare ? `<Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (isScreenSharing) {
                      if (screenStreamRef.current) {
                        screenStreamRef.current.getTracks().forEach((t) => t.stop());
                        screenStreamRef.current = null;
                      }
                      if (screenVideoRef.current) {
                        screenVideoRef.current.srcObject = null;
                      } else if (localVideoRef.current && localMediaStreamRef.current) {
                        localVideoRef.current.srcObject = localMediaStreamRef.current;
                      }
                      if (pcRef.current && localMediaStreamRef.current) {
                        const camTrack = localMediaStreamRef.current.getVideoTracks()[0] || null;
                        const sender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === "video");
                        if (sender) {
                          sender.replaceTrack(camTrack);
                        }
                      }
                      setIsScreenSharing(false);
                      return;
                    }

                    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getDisplayMedia) {
                      try {
                        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                        screenStreamRef.current = displayStream;
                        if (screenVideoRef.current) {
                          screenVideoRef.current.srcObject = displayStream;
                        } else if (localVideoRef.current) {
                          localVideoRef.current.srcObject = displayStream;
                        }
                        if (pcRef.current) {
                          const screenTrack = displayStream.getVideoTracks()[0];
                          if (screenTrack) {
                            const sender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === "video");
                            if (sender) {
                              sender.replaceTrack(screenTrack);
                            }
                          }
                        }
                        setIsScreenSharing(true);
                        displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
                          if (screenStreamRef.current) {
                            screenStreamRef.current.getTracks().forEach((t) => t.stop());
                            screenStreamRef.current = null;
                          }
                          if (screenVideoRef.current) {
                            screenVideoRef.current.srcObject = null;
                          } else if (localVideoRef.current && localMediaStreamRef.current) {
                            localVideoRef.current.srcObject = localMediaStreamRef.current;
                          }
                          if (pcRef.current && localMediaStreamRef.current) {
                            const camTrack = localMediaStreamRef.current.getVideoTracks()[0] || null;
                            const sender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === "video");
                            if (sender) {
                              sender.replaceTrack(camTrack);
                            }
                          }
                          setIsScreenSharing(false);
                        });
                      } catch (err) {
                        console.warn("[WebRTC] Screen share failed:", err);
                      }
                    }
                  }}
                  className="text-xs"
                >
                  {isScreenSharing ? "Stop Screen Share" : "Share Screen"}
                </Button>` : ""}
                ${hasRemoteVideo ? `<Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (remoteVideoRef.current && remoteVideoRef.current.srcObject instanceof MediaStream) {
                      const vTrack = remoteVideoRef.current.srcObject.getVideoTracks()[0];
                      if (vTrack) {
                        vTrack.enabled = !vTrack.enabled;
                        setRemoteVideoOff(!vTrack.enabled);
                      }
                    }
                  }}
                  className="text-xs"
                >
                  {remoteVideoOff ? "Start Remote Video" : "Stop Remote Video"}
                </Button>` : ""}
              </div>
          </CardHeader>
          <CardContent>
            {mediaError && (
              <div className="text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 text-xs p-3 rounded-lg mb-4">
                Warning: {mediaError}. Data channel messaging remains active.
              </div>
            )}
            ${hasSpeaker ? `<audio ref={remoteAudioRef} autoPlay />\n` : ""}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${hasCamera ? `<div className="relative rounded-lg bg-black/80 aspect-video flex flex-col items-center justify-center overflow-hidden border border-border">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <span className="absolute bottom-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs">
                  Local Camera {cameraOff ? "(Camera off)" : ""}
                </span>
              </div>` : ""}
              ${hasScreenShare && hasCamera ? `<div className={\`relative rounded-lg bg-black/80 aspect-video flex flex-col items-center justify-center overflow-hidden border border-border \${isScreenSharing ? "block" : "hidden"}\`}>
                <video ref={screenVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <span className="absolute bottom-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs">
                  Screen Share (Active)
                </span>
              </div>` : ""}
              ${hasScreenShare && !hasCamera ? `<div className="relative rounded-lg bg-black/80 aspect-video flex flex-col items-center justify-center overflow-hidden border border-border">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <span className="absolute bottom-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs">
                  Screen Share {isScreenSharing ? "(Active)" : "(Inactive)"}
                </span>
              </div>` : ""}
              ${hasRemoteVideo ? `<div className="relative rounded-lg bg-black/80 aspect-video flex flex-col items-center justify-center overflow-hidden border border-border">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <span className="absolute bottom-2 left-2 text-[10px] font-mono px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs">
                  Remote Stream {remoteVideoOff ? "(Video off)" : ""}
                </span>
              </div>` : ""}
              ${!hasCamera && !hasScreenShare && !hasRemoteVideo && (hasMic || hasSpeaker) ? `<div className="col-span-full p-4 rounded-lg bg-muted/30 border border-border flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>WebRTC Audio Stream Active (Microphone &amp; Speaker)</span>
                </div>
              </div>` : ""}
            </div>
          </CardContent>
        </Card>
\n`;
}
