"use client";

import React from "react";
import {
  Bot,
  Zap,
} from "lucide-react";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { LocalInput } from "../../../backend-nodes/graph-nodes/shared";
import { StateStoreVariablePicker } from "../StateStoreVariablePicker";
import { ChatPropsConfigProps } from "./types";

export const ChatPropsConfig: React.FC<ChatPropsConfigProps> = React.memo(({
  propMappings,
  onUpdatePropMapping,
  stateStores,
  effectiveStoreName,
  effectiveStoreId,
  onCreateChatMessageStateVariable,
  onQuickWireChatActions,
}) => {
  return (
    <div className="flex flex-col gap-3.5 p-3.5 rounded-xl bg-muted/20 border border-border/50 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-border/40 text-[11px]">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Bot size={13} className="text-cyan-500" />
          <span>AI Chat Thread Configuration</span>
        </div>
        <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 bg-cyan-500/10 text-cyan-500 border-cyan-500/20">
          AI Elements Chat
        </Badge>
      </div>

      {/* 1-Click State Store Shortcut Banner for Chat Messages & Input */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-cyan-500/[0.08] border border-cyan-500/25">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 shrink-0">
            <Zap size={14} />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">
              ⚡ Quick-Create Chat State Store Variables
            </div>
            <div className="text-[11px] text-muted-foreground">
              Auto-provisions ChatMessage[] messages history &amp; chatInput in your State Store &amp; TypesNode
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => onCreateChatMessageStateVariable?.(effectiveStoreId)}
          className="h-7 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer shrink-0 ml-2 shadow-xs"
        >
          <Zap size={11} className="mr-1" />
          Create &amp; Bind
        </Button>
      </div>

      {/* 1-Click Action Wiring Banner for History & Send Message */}
      {onQuickWireChatActions && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/[0.08] border border-amber-500/25">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <Zap size={14} />
            </div>
            <div>
              <div className="text-xs font-semibold text-foreground">
                ⚡ Quick-Wire Chat Action Pipeline
              </div>
              <div className="text-[11px] text-muted-foreground">
                Auto-wires fetchConversationHistory (onMount) &amp; sendMessage (onSend)
              </div>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onQuickWireChatActions}
            className="h-7 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shrink-0 ml-2 shadow-xs"
          >
            <Zap size={11} className="mr-1" />
            Wire Actions
          </Button>
        </div>
      )}

      {/* State Store Variable Picker for Chat Messages History */}
      <StateStoreVariablePicker
        label="Chat Messages State Variable"
        propName="messages"
        valueBinding={propMappings.chatMessagesBinding || propMappings.valueBinding || "messages"}
        storeName={propMappings.chatMessagesStoreName || propMappings.valueStoreName || effectiveStoreName}
        storeId={propMappings.chatMessagesStoreId || propMappings.valueStoreId || effectiveStoreId}
        mode={propMappings.valueMode || "store_var"}
        stateStores={stateStores}
        expectedType="any"
        placeholder="messages"
        description="StateStore variable containing conversation history (ChatMessage[])."
        onChange={(res) => {
          onUpdatePropMapping({
            chatMessagesBinding: res.valueBinding,
            chatMessagesStoreName: res.storeName,
            chatMessagesStoreId: res.storeId,
            valueBinding: res.valueBinding,
            valueStoreName: res.storeName,
            valueStoreId: res.storeId,
            valueMode: res.mode,
          });
        }}
      />

      {/* State Store Variable Picker for User Prompt Draft Input */}
      <StateStoreVariablePicker
        label="Draft Input State Variable (Optional)"
        propName="chatInput"
        valueBinding={propMappings.chatInputBinding || "chatInput"}
        storeName={propMappings.chatInputStoreName || effectiveStoreName}
        storeId={propMappings.chatInputStoreId || effectiveStoreId}
        mode={propMappings.valueMode || "store_var"}
        stateStores={stateStores}
        expectedType="string"
        placeholder="chatInput"
        description="Optional StateStore variable holding current user-typed prompt draft."
        onChange={(res) => {
          onUpdatePropMapping({
            chatInputBinding: res.valueBinding,
            chatInputStoreName: res.storeName,
            chatInputStoreId: res.storeId,
          });
        }}
      />

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Chat Header Title</Label>
        <LocalInput
          value={typeof propMappings.chatTitle === "string" ? propMappings.chatTitle : (propMappings.chatTitle ? String((propMappings.chatTitle as any).target?.value ?? "") : "AI Assistant")}
          onChange={(e) => onUpdatePropMapping({ chatTitle: e.target.value })}
          placeholder="e.g. AI Assistant, Support Bot"
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Prompt Input Placeholder</Label>
        <LocalInput
          value={typeof propMappings.chatPlaceholder === "string" ? propMappings.chatPlaceholder : (propMappings.chatPlaceholder ? String((propMappings.chatPlaceholder as any).target?.value ?? "") : "Type a message...")}
          onChange={(e) => onUpdatePropMapping({ chatPlaceholder: e.target.value })}
          placeholder="e.g. Type a message or question..."
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Empty State Heading</Label>
        <LocalInput
          value={typeof propMappings.chatEmptyTitle === "string" ? propMappings.chatEmptyTitle : (propMappings.chatEmptyTitle ? String((propMappings.chatEmptyTitle as any).target?.value ?? "") : "No messages yet")}
          onChange={(e) => onUpdatePropMapping({ chatEmptyTitle: e.target.value })}
          placeholder="e.g. No messages yet"
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Empty State Description</Label>
        <LocalInput
          value={typeof propMappings.chatEmptyDescription === "string" ? propMappings.chatEmptyDescription : (propMappings.chatEmptyDescription ? String((propMappings.chatEmptyDescription as any).target?.value ?? "") : "Start a conversation to see messages here")}
          onChange={(e) => onUpdatePropMapping({ chatEmptyDescription: e.target.value })}
          placeholder="e.g. Ask a question to start chatting"
          className="h-8 text-xs font-mono"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="space-y-0.5">
          <Label className="text-xs">Live Edge Auto-Scroll</Label>
          <p className="text-[10px] text-muted-foreground">
            Automatically scrolls down as assistant responses stream in
          </p>
        </div>
        <Switch
          checked={propMappings.chatAutoScroll ?? true}
          onCheckedChange={(val) => onUpdatePropMapping({ chatAutoScroll: val })}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="space-y-0.5">
          <Label className="text-xs">Floating Scroll Button</Label>
          <p className="text-[10px] text-muted-foreground">
            Shows jump-to-latest button when scrolled up into history
          </p>
        </div>
        <Switch
          checked={propMappings.chatShowScrollButton ?? true}
          onCheckedChange={(val) => onUpdatePropMapping({ chatShowScrollButton: val })}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="space-y-0.5">
          <Label className="text-xs">Show Avatars</Label>
          <p className="text-[10px] text-muted-foreground">
            Displays user and assistant avatar badges beside message bubbles
          </p>
        </div>
        <Switch
          checked={propMappings.chatShowAvatars ?? true}
          onCheckedChange={(val) => onUpdatePropMapping({ chatShowAvatars: val })}
        />
      </div>
    </div>
  );
});
ChatPropsConfig.displayName = "ChatPropsConfig";
