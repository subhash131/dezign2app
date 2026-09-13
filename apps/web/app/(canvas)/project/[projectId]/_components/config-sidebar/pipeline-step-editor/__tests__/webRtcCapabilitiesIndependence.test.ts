import { describe, it, expect } from "vitest";
import {
  resolveCapabilitiesFromStep,
  computeMediaMode,
} from "../PushToClientStepSection";
import { PipelineStepDraft } from "../types";

describe("WebRTC Capability Independence & Decoupling", () => {
  describe("resolveCapabilitiesFromStep", () => {
    it("preserves Microphone disabled when Speaker is enabled (Fixes coupling bug)", () => {
      const step: PipelineStepDraft = {
        id: "step-1",
        type: "push_to_client",
        name: "Push WebRTC",
        clientDeliveryProtocol: "WEBRTC",
        clientDeliveryMediaMode: "audio", // legacy or computed mode
        clientDeliveryEnableMic: false, // User explicitly unchecked Mic
        clientDeliveryEnableSpeaker: true, // User enabled Speaker
      };

      const resolved = resolveCapabilitiesFromStep(step);
      expect(resolved.enableMic).toBe(false);
      expect(resolved.enableSpeaker).toBe(true);
    });

    it("preserves Speaker disabled when Microphone is enabled", () => {
      const step: PipelineStepDraft = {
        id: "step-2",
        type: "push_to_client",
        name: "Push WebRTC",
        clientDeliveryProtocol: "WEBRTC",
        clientDeliveryMediaMode: "audio",
        clientDeliveryEnableMic: true,
        clientDeliveryEnableSpeaker: false, // User explicitly unchecked Speaker
      };

      const resolved = resolveCapabilitiesFromStep(step);
      expect(resolved.enableMic).toBe(true);
      expect(resolved.enableSpeaker).toBe(false);
    });

    it("preserves Camera disabled when Remote Video is enabled (Fixes coupling bug)", () => {
      const step: PipelineStepDraft = {
        id: "step-3",
        type: "push_to_client",
        name: "Push WebRTC",
        clientDeliveryProtocol: "WEBRTC",
        clientDeliveryMediaMode: "video", // legacy or computed mode
        clientDeliveryEnableCamera: false, // User explicitly unchecked Camera
        clientDeliveryEnableRemoteVideo: true, // User enabled Remote Video (watch only)
      };

      const resolved = resolveCapabilitiesFromStep(step);
      expect(resolved.enableCamera).toBe(false);
      expect(resolved.enableRemoteVideo).toBe(true);
    });

    it("preserves Remote Video disabled when Camera is enabled (broadcast only)", () => {
      const step: PipelineStepDraft = {
        id: "step-4",
        type: "push_to_client",
        name: "Push WebRTC",
        clientDeliveryProtocol: "WEBRTC",
        clientDeliveryMediaMode: "video",
        clientDeliveryEnableCamera: true,
        clientDeliveryEnableRemoteVideo: false,
      };

      const resolved = resolveCapabilitiesFromStep(step);
      expect(resolved.enableCamera).toBe(true);
      expect(resolved.enableRemoteVideo).toBe(false);
    });

    it("allows Screen Share to be enabled independently of Camera and Remote Video", () => {
      const step: PipelineStepDraft = {
        id: "step-5",
        type: "push_to_client",
        name: "Push WebRTC",
        clientDeliveryProtocol: "WEBRTC",
        clientDeliveryEnableCamera: false,
        clientDeliveryEnableRemoteVideo: false,
        clientDeliveryEnableScreenShare: true,
      };

      const resolved = resolveCapabilitiesFromStep(step);
      expect(resolved.enableScreenShare).toBe(true);
      expect(resolved.enableCamera).toBe(false);
      expect(resolved.enableRemoteVideo).toBe(false);
    });

    it("allows pure data-only connection with all audio and video disabled", () => {
      const step: PipelineStepDraft = {
        id: "step-6",
        type: "push_to_client",
        name: "Push WebRTC",
        clientDeliveryProtocol: "WEBRTC",
        clientDeliveryEnableDataChannel: true,
        clientDeliveryEnableMic: false,
        clientDeliveryEnableSpeaker: false,
        clientDeliveryEnableCamera: false,
        clientDeliveryEnableRemoteVideo: false,
        clientDeliveryEnableScreenShare: false,
      };

      const resolved = resolveCapabilitiesFromStep(step);
      expect(resolved.enableDataChannel).toBe(true);
      expect(resolved.enableMic).toBe(false);
      expect(resolved.enableSpeaker).toBe(false);
      expect(resolved.enableCamera).toBe(false);
      expect(resolved.enableRemoteVideo).toBe(false);
      expect(resolved.enableScreenShare).toBe(false);
    });

    it("supports legacy steps where granular flags are undefined (backward compatibility)", () => {
      const legacyAudioStep: PipelineStepDraft = {
        id: "step-legacy-audio",
        type: "push_to_client",
        name: "Legacy Audio WebRTC",
        clientDeliveryProtocol: "WEBRTC",
        clientDeliveryMediaMode: "audio",
      };

      const audioResolved = resolveCapabilitiesFromStep(legacyAudioStep);
      expect(audioResolved.enableMic).toBe(true);
      expect(audioResolved.enableSpeaker).toBe(true);
      expect(audioResolved.enableCamera).toBe(false);
      expect(audioResolved.enableRemoteVideo).toBe(false);

      const legacyVideoStep: PipelineStepDraft = {
        id: "step-legacy-video",
        type: "push_to_client",
        name: "Legacy Video WebRTC",
        clientDeliveryProtocol: "WEBRTC",
        clientDeliveryMediaMode: "video",
      };

      const videoResolved = resolveCapabilitiesFromStep(legacyVideoStep);
      expect(videoResolved.enableCamera).toBe(true);
      expect(videoResolved.enableRemoteVideo).toBe(true);
      expect(videoResolved.enableMic).toBe(false);
      expect(videoResolved.enableSpeaker).toBe(false);
    });
  });

  describe("computeMediaMode", () => {
    it("returns 'audio' when only speaker or only mic is enabled", () => {
      expect(
        computeMediaMode({
          enableMic: false,
          enableSpeaker: true,
          enableCamera: false,
          enableScreenShare: false,
          enableRemoteVideo: false,
        }),
      ).toBe("audio");

      expect(
        computeMediaMode({
          enableMic: true,
          enableSpeaker: false,
          enableCamera: false,
          enableScreenShare: false,
          enableRemoteVideo: false,
        }),
      ).toBe("audio");
    });

    it("returns 'video' when only remote video, camera, or screen share is enabled", () => {
      expect(
        computeMediaMode({
          enableMic: false,
          enableSpeaker: false,
          enableCamera: false,
          enableScreenShare: false,
          enableRemoteVideo: true,
        }),
      ).toBe("video");

      expect(
        computeMediaMode({
          enableMic: false,
          enableSpeaker: false,
          enableCamera: true,
          enableScreenShare: false,
          enableRemoteVideo: false,
        }),
      ).toBe("video");

      expect(
        computeMediaMode({
          enableMic: false,
          enableSpeaker: false,
          enableCamera: false,
          enableScreenShare: true,
          enableRemoteVideo: false,
        }),
      ).toBe("video");
    });

    it("returns 'audio-video' when any audio and any video are enabled simultaneously", () => {
      // Listen & watch only (speaker + remote video)
      expect(
        computeMediaMode({
          enableMic: false,
          enableSpeaker: true,
          enableCamera: false,
          enableScreenShare: false,
          enableRemoteVideo: true,
        }),
      ).toBe("audio-video");

      // Broadcast only (mic + camera)
      expect(
        computeMediaMode({
          enableMic: true,
          enableSpeaker: false,
          enableCamera: true,
          enableScreenShare: false,
          enableRemoteVideo: false,
        }),
      ).toBe("audio-video");
    });

    it("returns 'data' when no audio and no video channels are enabled", () => {
      expect(
        computeMediaMode({
          enableMic: false,
          enableSpeaker: false,
          enableCamera: false,
          enableScreenShare: false,
          enableRemoteVideo: false,
        }),
      ).toBe("data");
    });
  });
});
