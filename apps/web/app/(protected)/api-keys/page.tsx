"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import { ApiKeyHeader } from "./_components/api-key-header";
import { ApiKeyList } from "./_components/api-key-list";
import { CreateKeyCard } from "./_components/create-key-card";
import { SecurityTip } from "./_components/security-tip";
import { RevokeKeyDialog } from "./_components/revoke-key-dialog";
import { GeneratedKeyDialog } from "./_components/generated-key-dialog";
import { Doc, Id } from "@workspace/backend/_generated/dataModel";

export default function ApiKeysPage() {
  const [newKeyName, setNewKeyName] = useState(""); 
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const { 
    results: keys, 
    status: keysStatus, 
    loadMore: loadMoreKeys 
  } = usePaginatedQuery(
    api.api_keys.listPaginated,
    {},
    { initialNumItems: 20 }
  );

  // Fetch all user projects for the project selector
  const projectsResult = useQuery(api.projects.getProjectsByOrganization, { 
    paginationOpts: { numItems: 100, cursor: null } 
  });
  const projects = projectsResult?.page ?? [];

  const generateKey = useMutation(api.api_keys.generate);
  const revokeKey = useMutation(api.api_keys.revoke);

  const [isGenerating, setIsGenerating] = useState(false);
  const [justGeneratedKey, setJustGeneratedKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<Doc<"api_keys"> | null>(null);

  const handleGenerate = async () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a name for the API key");
      return;
    }
    if (!selectedProjectId) {
      toast.error("Please select a project for this key");
      return;
    }

    setIsGenerating(true);
    try {
      const key = await generateKey({ 
        name: newKeyName, 
        projectId: selectedProjectId,
      });
      setJustGeneratedKey(key);
      setNewKeyName("");
      setSelectedProjectId(null);
      toast.success("API Key generated!");
    } catch (e) {
      toast.error("Failed to generate key");
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };


  const confirmRevoke = (key: Doc<"api_keys">) => {
    setKeyToRevoke(key);
    setIsRevokeDialogOpen(true);
  };

  const handleRevoke = async () => {
    if (!keyToRevoke) return;
    try {
      await revokeKey({ id: keyToRevoke._id });
      toast.success("Key revoked successfully");
      setIsRevokeDialogOpen(false);
      setKeyToRevoke(null);
    } catch (e) {
      toast.error("Failed to revoke key");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const filteredKeys = keys?.filter(k => 
    k.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="container max-w-6xl py-10 px-4 space-y-8 animate-in fade-in duration-500">
      <ApiKeyHeader />

      <div className="grid gap-6 md:grid-cols-12">
        <div className="md:col-span-8 space-y-6">
          <ApiKeyList 
            keys={keys}
            filteredKeys={filteredKeys}
            status={keysStatus}
            loadMore={() => loadMoreKeys(20)}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            confirmRevoke={confirmRevoke}
          />
        </div>

        <div className="md:col-span-4 space-y-6">
          <CreateKeyCard 
            newKeyName={newKeyName}
            setNewKeyName={setNewKeyName}
            isGenerating={isGenerating}
            handleGenerate={handleGenerate}
            projects={projects.map(p => ({ _id: p._id, name: p.name }))}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={(id) => setSelectedProjectId(id)}
          />
          <SecurityTip />
        </div>
      </div>

      <RevokeKeyDialog 
        isOpen={isRevokeDialogOpen}
        onOpenChange={setIsRevokeDialogOpen}
        keyToRevoke={keyToRevoke}
        handleRevoke={handleRevoke}
      />

      <GeneratedKeyDialog 
        justGeneratedKey={justGeneratedKey}
        setJustGeneratedKey={setJustGeneratedKey}
        copyToClipboard={copyToClipboard}
      />
    </div>
  );
}
