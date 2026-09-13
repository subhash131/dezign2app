import type { LinkedRealtimeConnectionInfo } from "../types";

export function generateWebRtcEffects(
  webrtcConnections: LinkedRealtimeConnectionInfo[],
  hasAuth: boolean,
): string {
  if (webrtcConnections.length === 0) return "";

  const rtcByUrl = new Map<string, LinkedRealtimeConnectionInfo[]>();
  webrtcConnections.forEach((conn) => {
    const url = conn.streamUrl!;
    if (!rtcByUrl.has(url)) rtcByUrl.set(url, []);
    rtcByUrl.get(url)!.push(conn);
  });

  const effectBlocks: string[] = [];
  rtcByUrl.forEach((conns, streamUrl) => {
    const rooms = Array.from(
      new Set(
        conns
          .map((c) => c.room?.trim())
          .filter((r): r is string => Boolean(r)),
      ),
    );

    const channelLabels = Array.from(
      new Set(
        conns
          .map((c) => c.eventName?.trim())
          .filter((e): e is string => Boolean(e)),
      ),
    );
    const defaultChannelLabel = channelLabels[0] || "data-channel";

    const joinStatements = rooms
      .map((r) => `          ws?.send(JSON.stringify({ action: "join", room: "${r}" }));`)
      .join("\n");

    const leaveStatements = rooms
      .map((r) => `        if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ action: "leave", room: "${r}" })); }`)
      .join("\n");

    const activeMediaConns = conns.filter((c) => c.mediaMode !== "data");
    const connHasMic = activeMediaConns.some(
      (c) =>
        c.enableMic === true ||
        (c.enableMic === undefined &&
          (c.enableAudio === true || c.mediaMode === "audio" || c.mediaMode === "audio-video")),
    );
    const connHasSpeaker = activeMediaConns.some(
      (c) =>
        c.enableSpeaker === true ||
        (c.enableSpeaker === undefined && (c.mediaMode === "audio" || c.mediaMode === "audio-video")),
    );
    const connHasCamera = activeMediaConns.some(
      (c) =>
        c.enableCamera === true ||
        (c.enableCamera === undefined &&
          (c.enableVideo === true || c.mediaMode === "video" || c.mediaMode === "audio-video")),
    );
    const connHasScreenShare = activeMediaConns.some((c) => c.enableScreenShare === true);
    const connHasRemoteVideo = activeMediaConns.some(
      (c) =>
        c.enableRemoteVideo === true ||
        (c.enableRemoteVideo === undefined &&
          (c.enableVideo === true || c.mediaMode === "video" || c.mediaMode === "audio-video")),
    );
    const connIsMedia = connHasMic || connHasSpeaker || connHasCamera || connHasScreenShare || connHasRemoteVideo;
    const customIceServer = conns.find((c) => c.iceServerUrl)?.iceServerUrl || "stun:stun.l.google.com:19302";

    effectBlocks.push(`  // Real-time WebRTC Data Channel listener for ${conns[0]?.sourceServiceName || "Service"}
  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let dc: RTCDataChannel | null = null;
    let ws: WebSocket | null = null;
    ${connHasMic || connHasCamera ? "let localStream: MediaStream | null = null;\n    " : ""}let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function handleIncomingData(raw: unknown, sourceChannel: string) {
      if (!isMounted) return;
      let parsed: unknown = raw;
      try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        parsed = raw;
      }

      const parsedObj =
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      const evtName =
        parsedObj && typeof parsedObj.event === "string"
          ? parsedObj.event
          : parsedObj && typeof parsedObj.type === "string"
          ? String(parsedObj.type)
          : sourceChannel || "message";
      const evtData =
        parsedObj && "data" in parsedObj && parsedObj.data !== undefined
          ? parsedObj.data
          : parsed;

      setTriggerLogs((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          eventName: evtName,
          eventType: "WebRTC",
          timestamp: new Date().toLocaleTimeString(),
          url: "${streamUrl}",
          method: "RTC",
          data: evtData,
        },
        ...prev,
      ]);
    }

    async function initWebRtc() {
      if (!isMounted) return;
      try {
        if (typeof window === "undefined" || !("RTCPeerConnection" in window)) {
          console.warn("[WebRTC] RTCPeerConnection not supported in this environment");
          return;
        }

        pc = new RTCPeerConnection({
          iceServers: [{ urls: "${customIceServer}" }],
        });
        ${connIsMedia ? "pcRef.current = pc;\n        " : ""}
        ${connHasMic || connHasCamera ? `if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
          try {
            if (localStream) {
              try { localStream.getTracks().forEach((t) => t.stop()); } catch {}
            }
            localStream = await navigator.mediaDevices.getUserMedia({
              audio: ${connHasMic},
              video: ${connHasCamera},
            });
            if (!isMounted || !pc) {
              localStream?.getTracks().forEach((t) => t.stop());
              return;
            }
            localMediaStreamRef.current = localStream;
            ${connHasCamera ? `if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStream;
            }\n            ` : ""}setMediaActive(true);
            localStream.getTracks().forEach((track) => {
              if (isMounted && pc && localStream) {
                pc.addTrack(track, localStream);
              }
            });
          } catch (mErr) {
            console.warn("[WebRTC] Media access not available or denied:", mErr);
            if (isMounted) {
              setMediaError(mErr instanceof Error ? mErr.message : "Media permissions denied");
            }
          }
        }\n\n        ` : ""}${connHasRemoteVideo || connHasSpeaker ? `pc.ontrack = (event) => {
          if (!isMounted) return;
          console.log("[WebRTC] Received remote track:", event.track.kind);
          ${connHasRemoteVideo ? `if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
            setMediaActive(true);
          }\n          ` : ""}${connHasSpeaker ? `if (remoteAudioRef.current && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0];
            setMediaActive(true);
          }\n          ` : ""}
        };\n        ` : ""}

        if (!isMounted || !pc) return;

        // Setup local Data Channel
        dc = pc.createDataChannel("${defaultChannelLabel}");
        dc.onopen = () => {
          if (isMounted) console.log("[WebRTC] Data channel open (${defaultChannelLabel})");
        };
        dc.onmessage = (event) => {
          handleIncomingData(event.data, dc?.label || "${defaultChannelLabel}");
        };
        dc.onerror = (err) => {
          if (isMounted) console.warn("[WebRTC] Data channel error:", err);
        };

        // Handle remote inbound Data Channel
        pc.ondatachannel = (event) => {
          const remoteDc = event.channel;
          remoteDc.onmessage = (e) => {
            handleIncomingData(e.data, remoteDc.label);
          };
        };

        if (!isMounted || !pc) return;

        // Setup signaling via WebSocket
        ${hasAuth ? `const rawToken = await getAuthBearerToken();
        const token = rawToken ? rawToken.replace(/^Bearer\\s+/i, "") : null;
        const targetUrl = token ? \`${streamUrl}?token=\${encodeURIComponent(token)}\` : "${streamUrl}";` : `const targetUrl = "${streamUrl}";`}
        ws = new WebSocket(targetUrl);

        ws.onopen = async () => {
          if (!isMounted || !pc) return;
          console.log("[WebRTC] Signaling channel connected to " + targetUrl);
${joinStatements ? `${joinStatements}\n` : ""}          if (isMounted && pc) {
            try {
              const offer = await pc.createOffer();
              if (!isMounted || !pc) return;
              await pc.setLocalDescription(offer);
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  action: "signal",
                  room: ${rooms[0] ? `"${rooms[0]}"` : "undefined"},
                  signalType: "offer",
                  signalData: offer,
                }));
              }
            } catch (err) {
              console.warn("[WebRTC] Failed to create offer:", err);
            }
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              action: "signal",
              room: ${rooms[0] ? `"${rooms[0]}"` : "undefined"},
              signalType: "candidate",
              signalData: event.candidate,
            }));
          }
        };

        ws.onmessage = async (event) => {
          if (!isMounted || !pc) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "webrtc-data") {
              handleIncomingData(msg.data, msg.event || "${defaultChannelLabel}");
              return;
            }
            if (msg.type === "webrtc-signal" || msg.action === "signal") {
              const signal = msg.signalData || msg.data;
              const sType = msg.signalType || signal?.type;
              if (sType === "offer" && isMounted && pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
                if (!isMounted || !pc) return;
                const answer = await pc.createAnswer();
                if (!isMounted || !pc) return;
                await pc.setLocalDescription(answer);
                if (ws && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    action: "signal",
                    room: msg.room || ${rooms[0] ? `"${rooms[0]}"` : "undefined"},
                    signalType: "answer",
                    signalData: answer,
                  }));
                }
              } else if (sType === "answer" && isMounted && pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
              } else if (sType === "candidate" && isMounted && pc && signal) {
                await pc.addIceCandidate(new RTCIceCandidate(signal));
              }
            }
          } catch {
            // Non-JSON frame ignored
          }
        };

        ws.onerror = (_event) => {
          if (!isMounted) return;
          console.warn("[WebRTC] Signaling channel error (${streamUrl})");
        };

        ws.onclose = (_event) => {
          if (!isMounted) return;
          console.warn("[WebRTC] Signaling channel closed (${streamUrl}). Reconnecting in 3s...");
          reconnectTimer = setTimeout(initWebRtc, 3000);
        };
      } catch (err) {
        if (!isMounted) return;
        console.error("[WebRTC] Failed to initialize WebRTC (${streamUrl}):", err);
        reconnectTimer = setTimeout(initWebRtc, 5000);
      }
    }

    initWebRtc();

    return () => {
      isMounted = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ${connIsMedia ? `${connHasScreenShare ? `if (screenStreamRef.current) {
        try {
          screenStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch {}
        screenStreamRef.current = null;
      }\n      ` : ""}${connHasMic || connHasCamera ? `if (localMediaStreamRef.current) {
        try {
          localMediaStreamRef.current.getTracks().forEach((t) => t.stop());
        } catch {}
        localMediaStreamRef.current = null;
      }\n      ` : ""}${connHasMic || connHasCamera ? `if (localStream) {
        try {
          localStream.getTracks().forEach((t) => t.stop());
        } catch {}
        localStream = null;
      }\n      ` : ""}` : ""}
      if (dc) {
        try { dc.close(); } catch {}
        dc = null;
      }
      if (pc) {
        try { pc.close(); } catch {}
        pc = null;
      }
      ${connIsMedia ? "pcRef.current = null;\n      " : ""}
      if (ws) {
        try {
${leaveStatements ? `${leaveStatements}\n` : ""}          ws.close();
        } catch {}
        ws = null;
      }
    };
  }, []);`);
  });

  return effectBlocks.join("\n\n") + "\n\n";
}
