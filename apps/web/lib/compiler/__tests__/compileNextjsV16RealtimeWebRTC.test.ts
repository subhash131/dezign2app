import { describe, it, expect } from "vitest";
import { compileWebPageNodes } from "../compileWebPageNode";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { AnyMessagingResource } from "@workspace/canvas/types";

describe("compileWebPageNodes Realtime WebRTC generation", () => {
  it("generates WebRTC listener, data channel, signaling exchange, and Output Log for manual realtimeConnections", () => {
    const webPageNode: BackendNode = {
      id: "node-page-stream",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/stream",
        appSlug: "stream-app",
        realtimeConnections: [
          {
            id: "rtc-stream-room",
            protocol: "WEBRTC",
            eventName: "stream.feed",
            room: "room:conference",
            sourceServiceNodeId: "node-service-stream",
            sourceServiceLabel: "StreamService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-stream",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "StreamService",
        port: "8092",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Test Stream App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // 1. Verify signaling WebSocket connection to ws://localhost:8092/ws
    expect(code).toContain('const targetUrl = "ws://localhost:8092/ws";');
    expect(code).toContain("ws = new WebSocket(targetUrl);");

    // 2. Verify RTCPeerConnection and RTCDataChannel initialization
    expect(code).toContain("pc = new RTCPeerConnection({");
    expect(code).toContain('iceServers: [{ urls: "stun:stun.l.google.com:19302" }]');
    expect(code).toContain('dc = pc.createDataChannel("stream.feed");');
    expect(code).toContain("pc.ondatachannel = (event) => {");

    // 3. Verify signaling exchange (offer, answer, candidate) and room join
    expect(code).toContain('ws?.send(JSON.stringify({ action: "join", room: "room:conference" }))');
    expect(code).toContain('signalType: "offer"');
    expect(code).toContain('signalType: "candidate"');
    expect(code).toContain('signalType: "answer"');

    // 4. Verify message handler logs with WebRTC event type
    expect(code).toContain('eventType: "WebRTC"');
    expect(code).toContain('method: "RTC"');

    // 5. Verify cleanup on unmount
    expect(code).toContain("dc.close()");
    expect(code).toContain("pc.close()");
    expect(code).toContain('ws.send(JSON.stringify({ action: "leave", room: "room:conference" }))');
    expect(code).toContain("ws.close()");

    // 6. Verify UI contains the Output Log card and WebRTC Connected badge
    expect(code).toContain("Output Log");
    expect(code).toContain("WebRTC Connected");
    expect(code).toContain("Listening for real-time events...");
  });

  it("discovers pipeline-derived push_to_client WebRTC steps and generates WebRTC client hook", () => {
    const webPageNode: BackendNode = {
      id: "node-page-feed",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/feed",
        appSlug: "social-feed",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-feed",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "FeedService",
        port: "8094",
      },
    };

    const events: (AnyMessagingResource & {
      nodeId: string;
      variant: "publish" | "consume";
    })[] = [
      {
        id: "ev-feed-published",
        name: "feedPublished",
        nodeId: "node-service-feed",
        variant: "consume",
        pipelineSteps: [
          {
            id: "step-rtc-feed",
            name: "pushFeedViaWebRTC",
            type: "push_to_client",
            enabled: true,
            clientDeliveryProtocol: "WEBRTC",
            clientDeliveryTargetPageId: "node-page-feed",
            clientDeliveryEventName: "feed.post.created",
            clientDeliveryRoom: "room:livefeed",
            inputBindings: [
              {
                argName: "payload",
                source: { kind: "req_body", field: "" },
              },
            ],
          },
        ],
      },
    ];

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      events,
      [webPageNode, serviceNode],
      [],
      "Test Feed App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Derived connection correctly bound to FeedService port 8094
    expect(code).toContain('const targetUrl = "ws://localhost:8094/ws";');
    expect(code).toContain('dc = pc.createDataChannel("feed.post.created");');
    expect(code).toContain('ws?.send(JSON.stringify({ action: "join", room: "room:livefeed" }))');
    expect(code).toContain('eventType: "WebRTC"');
    expect(code).toContain("WebRTC Connected");
  });

  it("attaches auth bearer token to signaling WebSocket URL when auth node is present", () => {
    const authNode: BackendNode = {
      id: "node-auth",
      type: "auth",
      position: { x: 200, y: 200 },
      fractionalIndex: "a0",
      data: {
        label: "Auth",
      },
    };

    const webPageNode: BackendNode = {
      id: "node-page-private-room",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "/private-room",
        appSlug: "secure-app",
        realtimeConnections: [
          {
            id: "rtc-private",
            protocol: "WEBRTC",
            eventName: "private.stream",
            room: "private:room123",
            sourceServiceNodeId: "node-service-secure",
            sourceServiceLabel: "SecureService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-secure",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a2",
      data: {
        label: "SecureService",
        port: "8099",
      },
    };

    const edgeToAuth: BackendEdge = {
      id: "edge-page-auth",
      source: "node-auth",
      target: "node-page-private-room",
      type: "connection",
      fractionalIndex: "a0",
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [authNode, webPageNode, serviceNode],
      [edgeToAuth],
      "Test Secure App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Verify token retrieval and parameter injection
    expect(code).toContain('import { getAuthBearerToken } from "@/lib/auth-token";');
    expect(code).toContain("const rawToken = await getAuthBearerToken();");
    expect(code).toContain("const targetUrl = token ? `ws://localhost:8099/ws?token=${encodeURIComponent(token)}` : \"ws://localhost:8099/ws\";");
  });

  it("generates audio/video media streams, local/remote video refs, controls, and track cleanup when mediaMode is audio-video", () => {
    const webPageNode: BackendNode = {
      id: "node-page-conf",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/conference",
        appSlug: "conf-app",
        realtimeConnections: [
          {
            id: "rtc-conf",
            protocol: "WEBRTC",
            eventName: "conf.chat",
            room: "room:conf123",
            mediaMode: "audio-video",
            iceServerUrl: "stun:custom.stun.server:3478",
            sourceServiceNodeId: "node-service-conf",
            sourceServiceLabel: "ConfService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-conf",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "ConfService",
        port: "8096",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Test Conference App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // 1. Verify useRef is imported
    expect(code).toContain('useRef');

    // 2. Verify custom STUN server
    expect(code).toContain('iceServers: [{ urls: "stun:custom.stun.server:3478" }]');

    // 3. Verify media stream capture and track attachment
    expect(code).toContain("navigator.mediaDevices.getUserMedia({");
    expect(code).toContain("audio: true");
    expect(code).toContain("video: true");
    expect(code).toContain("localVideoRef.current.srcObject = localStream;");
    expect(code).toContain("pc.addTrack(track, localStream);");

    // 4. Verify remote track listener
    expect(code).toContain("pc.ontrack = (event) => {");
    expect(code).toContain("remoteVideoRef.current.srcObject = event.streams[0];");

    // 5. Verify track stopping on unmount and localStream scope in outer useEffect
    expect(code).toMatch(/useEffect\(\(\) => {[\s\S]*let localStream: MediaStream \| null = null;[\s\S]*async function initWebRtc/);
    expect(code).toContain("localStream.getTracks().forEach((t) => t.stop())");

    // 6. Verify UI contains WebRTC Live Media card, video tags, and mute buttons
    expect(code).toContain("WebRTC Live Media");
    expect(code).toContain("<video ref={localVideoRef}");
    expect(code).toContain("<video ref={remoteVideoRef}");
    expect(code).toContain("Mute Mic");
    expect(code).toContain("Start Camera");
    expect(code).toContain("Stop Camera");
    expect(code).toContain("Stop Remote Video");
  });

  it("handles pipeline-derived push_to_client steps with clientDeliveryMediaMode video", () => {
    const webPageNode: BackendNode = {
      id: "node-page-monitor",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/monitor",
        appSlug: "monitor-app",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-cam",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "CameraService",
        port: "8097",
      },
    };

    const events: (AnyMessagingResource & {
      nodeId: string;
      variant: "publish" | "consume";
    })[] = [
      {
        id: "ev-cam-stream",
        name: "cameraStream",
        nodeId: "node-service-cam",
        variant: "consume",
        pipelineSteps: [
          {
            id: "step-rtc-cam",
            name: "pushCameraStream",
            type: "push_to_client",
            enabled: true,
            clientDeliveryProtocol: "WEBRTC",
            clientDeliveryMediaMode: "video",
            clientDeliveryTargetPageId: "node-page-monitor",
            clientDeliveryEventName: "cam.feed",
            clientDeliveryRoom: "room:security",
          },
        ],
      },
    ];

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      events,
      [webPageNode, serviceNode],
      [],
      "Test Monitor App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Video is true, audio is false
    expect(code).toContain("audio: false");
    expect(code).toContain("video: true");
    expect(code).toContain("<video ref={localVideoRef}");
    expect(code).toContain("WebRTC Live Media");
  });

  it("generates mic-only audio stream without video when enableMic is true", () => {
    const webPageNode: BackendNode = {
      id: "node-page-voice",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/voice-room",
        appSlug: "voice-app",
        realtimeConnections: [
          {
            id: "rtc-voice",
            protocol: "WEBRTC",
            eventName: "voice.chat",
            enableMic: true,
            enableSpeaker: false,
            enableCamera: false,
            enableScreenShare: false,
            enableRemoteVideo: false,
            sourceServiceNodeId: "node-service-voice",
            sourceServiceLabel: "VoiceService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-voice",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "VoiceService",
        port: "8098",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Voice App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Mic enabled, camera disabled
    expect(code).toContain("audio: true");
    expect(code).toContain("video: false");
    expect(code).toContain("Mute Mic");
    expect(code).not.toContain("Start Camera");
    expect(code).toContain("WebRTC Audio Stream Active (Microphone &amp; Speaker)");
  });

  it("generates speaker-only audio playback when enableSpeaker is true", () => {
    const webPageNode: BackendNode = {
      id: "node-page-radio",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/radio",
        appSlug: "radio-app",
        realtimeConnections: [
          {
            id: "rtc-radio",
            protocol: "WEBRTC",
            eventName: "radio.broadcast",
            enableMic: false,
            enableSpeaker: true,
            enableCamera: false,
            enableScreenShare: false,
            enableRemoteVideo: false,
            sourceServiceNodeId: "node-service-radio",
            sourceServiceLabel: "RadioService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-radio",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "RadioService",
        port: "8099",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Radio App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Does NOT call getUserMedia because both mic and camera are false
    expect(code).not.toContain("navigator.mediaDevices?.getUserMedia && (true");
    // Listens on remote audio track
    expect(code).toContain("remoteAudioRef.current.srcObject = event.streams[0];");
    expect(code).toContain("<audio ref={remoteAudioRef} autoPlay />");
    expect(code).toContain("Mute Speaker");
  });

  it("generates screen sharing controls when enableScreenShare is true", () => {
    const webPageNode: BackendNode = {
      id: "node-page-screenshare",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/screenshare",
        appSlug: "screen-app",
        realtimeConnections: [
          {
            id: "rtc-screen",
            protocol: "WEBRTC",
            eventName: "screen.stream",
            enableScreenShare: true,
            sourceServiceNodeId: "node-service-screen",
            sourceServiceLabel: "ScreenService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-screen",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "ScreenService",
        port: "8100",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Screen Share App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    expect(code).toContain("getDisplayMedia({ video: true })");
    expect(code).toContain("Share Screen");
    expect(code).toContain("Stop Screen Share");
    expect(code).toContain("<video ref={localVideoRef}");
  });

  it("generates separate dedicated buttons and video elements for Camera, Screen Share, and Remote Video when all are enabled", () => {
    const webPageNode: BackendNode = {
      id: "node-page-all-media",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/all-media",
        appSlug: "all-media-app",
        realtimeConnections: [
          {
            id: "rtc-all-media",
            protocol: "WEBRTC",
            eventName: "multi.feed",
            enableMic: true,
            enableSpeaker: true,
            enableCamera: true,
            enableScreenShare: true,
            enableRemoteVideo: true,
            sourceServiceNodeId: "node-service-media",
            sourceServiceLabel: "MediaService",
          },
        ],
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-media",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "MediaService",
        port: "8101",
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Multi-Media App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // 1. Verify separate video element refs are declared
    expect(code).toContain("const localVideoRef = useRef<HTMLVideoElement | null>(null);");
    expect(code).toContain("const screenVideoRef = useRef<HTMLVideoElement | null>(null);");
    expect(code).toContain("const remoteVideoRef = useRef<HTMLVideoElement | null>(null);");

    // 2. Verify separate buttons exist for each capability
    expect(code).toContain("Mute Mic");
    expect(code).toContain("Unmute Mic");
    expect(code).toContain("Mute Speaker");
    expect(code).toContain("Unmute Speaker");
    expect(code).toContain("Start Camera");
    expect(code).toContain("Stop Camera");
    expect(code).toContain("Share Screen");
    expect(code).toContain("Stop Screen Share");
    expect(code).toContain("Start Remote Video");
    expect(code).toContain("Stop Remote Video");

    // 3. Verify distinct video feed cards are rendered
    expect(code).toContain("Local Camera");
    expect(code).toContain("Screen Share (Active)");
    expect(code).toContain("Remote Stream");

    // 4. Verify no unsafe type casts in media controls
    expect(code).not.toContain("as MediaStream");
  });

  it("omits all video, audio, media controls, and getUserMedia when all media capabilities are unchecked (data channel only)", () => {
    const webPageNode: BackendNode = {
      id: "node-page-data-only",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/data-feed",
        appSlug: "data-feed-app",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-data",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "DataService",
        port: "8102",
        endpoints: [
          {
            id: "ep-push-data",
            name: "pushData",
            type: "POST",
            pipelineSteps: [
              {
                id: "step-push-data-rtc",
                type: "push_to_client",
                name: "Push Realtime Data",
                clientDeliveryProtocol: "WEBRTC",
                clientDeliveryTargetPageId: "node-page-data-only",
                clientDeliveryEventName: "data.event",
                clientDeliveryEnableDataChannel: true,
                clientDeliveryEnableMic: false,
                clientDeliveryEnableSpeaker: false,
                clientDeliveryEnableCamera: false,
                clientDeliveryEnableScreenShare: false,
                clientDeliveryEnableRemoteVideo: false,
                clientDeliveryMediaMode: "data",
              },
            ],
          },
        ],
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Data Feed App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // 1. Verify Data Channel is created and functional
    expect(code).toContain('dc = pc.createDataChannel("data.event");');
    expect(code).toContain("WebRTC Connected");
    expect(code).toContain("Output Log");

    // 2. Verify all media refs and state are completely omitted
    expect(code).not.toContain("localVideoRef");
    expect(code).not.toContain("remoteVideoRef");
    expect(code).not.toContain("remoteAudioRef");
    expect(code).not.toContain("localMediaStreamRef");
    expect(code).not.toContain("screenVideoRef");
    expect(code).not.toContain("screenStreamRef");

    // 3. Verify no getUserMedia or media track calls
    expect(code).not.toContain("navigator.mediaDevices.getUserMedia");
    expect(code).not.toContain("navigator.mediaDevices.getDisplayMedia");

    // 4. Verify no media UI components or control buttons
    expect(code).not.toContain("WebRTC Live Media");
    expect(code).not.toContain("Stop Camera");
    expect(code).not.toContain("Start Camera");
    expect(code).not.toContain("Mute Mic");
    expect(code).not.toContain("Unmute Mic");
    expect(code).not.toContain("Mute Speaker");
    expect(code).not.toContain("Unmute Speaker");
    expect(code).not.toContain("Share Screen");
    expect(code).not.toContain("Stop Remote Video");
    expect(code).not.toContain("<video");
    expect(code).not.toContain("<audio");
  });

  it("omits video elements and camera controls when only microphone is enabled", () => {
    const webPageNode: BackendNode = {
      id: "node-page-mic-only",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/mic-feed",
        appSlug: "mic-feed-app",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-voice",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "VoiceService",
        port: "8103",
        endpoints: [
          {
            id: "ep-push-voice",
            name: "pushVoice",
            type: "POST",
            pipelineSteps: [
              {
                id: "step-push-voice-rtc",
                type: "push_to_client",
                name: "Push Voice",
                clientDeliveryProtocol: "WEBRTC",
                clientDeliveryTargetPageId: "node-page-mic-only",
                clientDeliveryEventName: "voice.stream",
                clientDeliveryEnableDataChannel: true,
                clientDeliveryEnableMic: true,
                clientDeliveryEnableSpeaker: false,
                clientDeliveryEnableCamera: false,
                clientDeliveryEnableScreenShare: false,
                clientDeliveryEnableRemoteVideo: false,
                clientDeliveryMediaMode: "audio",
              },
            ],
          },
        ],
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Voice App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // 1. Verify mic controls and audio-only media permissions
    expect(code).toContain("Mute Mic");
    expect(code).toContain("navigator.mediaDevices.getUserMedia");
    expect(code).toContain("audio: true");
    expect(code).toContain("video: false");

    // 2. Verify no video elements or video controls exist
    expect(code).not.toContain("<video");
    expect(code).not.toContain("localVideoRef");
    expect(code).not.toContain("remoteVideoRef");
    expect(code).not.toContain("screenVideoRef");
    expect(code).not.toContain("Start Camera");
    expect(code).not.toContain("Stop Camera");
    expect(code).not.toContain("Share Screen");
    expect(code).not.toContain("Stop Remote Video");
  });

  it("renders speaker controls when enableSpeaker is true even if mic is disabled (receive-only audio)", () => {
    const webPageNode: BackendNode = {
      id: "node-page-speaker-only",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/listen",
        appSlug: "radio-listen",
      },
    };

    const serviceNode: BackendNode = {
      id: "node-service-speaker",
      type: "service",
      position: { x: 400, y: 0 },
      fractionalIndex: "a1",
      data: {
        label: "RadioService",
        port: "8104",
        endpoints: [
          {
            id: "ep-push-speaker",
            name: "pushRadio",
            type: "POST",
            pipelineSteps: [
              {
                id: "step-push-speaker-rtc",
                type: "push_to_client",
                name: "Push Radio Stream",
                clientDeliveryProtocol: "WEBRTC",
                clientDeliveryTargetPageId: "node-page-speaker-only",
                clientDeliveryEventName: "radio.broadcast",
                clientDeliveryEnableDataChannel: true,
                clientDeliveryEnableMic: false,
                clientDeliveryEnableSpeaker: true,
                clientDeliveryEnableCamera: false,
                clientDeliveryEnableScreenShare: false,
                clientDeliveryEnableRemoteVideo: false,
                clientDeliveryMediaMode: "audio",
              },
            ],
          },
        ],
      },
    };

    const result = compileWebPageNodes(
      [webPageNode],
      [],
      [],
      [webPageNode, serviceNode],
      [],
      "Radio App",
    );

    const pageFile = result.files.find((f) => f.filename.includes("page.tsx"));
    expect(pageFile).toBeDefined();

    const code = pageFile!.content;

    // Speaker controls must be rendered
    expect(code).toContain("Mute Speaker");
    expect(code).toContain("<audio ref={remoteAudioRef} autoPlay />");

    // Microphone controls and getUserMedia should NOT be present
    expect(code).not.toContain("Mute Mic");
    expect(code).not.toContain("navigator.mediaDevices.getUserMedia");
  });
});


