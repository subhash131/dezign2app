"use client";

import { 
  SearchIcon, 
  KeyIcon, 
  TrashIcon, 
  CalendarIcon,
  FolderIcon
} from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@workspace/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { Badge } from "@workspace/ui/components/badge";
import { useEffect, useRef } from "react";
import { Spinner } from "@workspace/ui/components/spinner";
import { Doc } from "@workspace/backend/_generated/dataModel";

interface ApiKeyListProps {
  keys: (Doc<"api_keys"> & { projectName?: string })[] | undefined;
  filteredKeys: (Doc<"api_keys"> & { projectName?: string })[] | undefined;
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  confirmRevoke: (key: Doc<"api_keys">) => void;
}

export function ApiKeyList({ 
  keys, 
  filteredKeys, 
  status,
  loadMore,
  searchQuery, 
  setSearchQuery, 
  confirmRevoke 
}: ApiKeyListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "CanLoadMore") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries?.[0]?.isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [status, loadMore]);

  return (
    <Card className="border-none shadow-lg bg-background/50 backdrop-blur-sm border border-border/50">
      <CardHeader className="pb-3 text-sm">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <KeyIcon className="size-5 text-primary" />
            Active Keys
          </CardTitle>
          <div className="relative w-full max-w-[200px]">
            <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search keys..."
              className="pl-8 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {keys === undefined ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground space-y-4">
            <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-sm">Loading keys...</p>
          </div>
        ) : filteredKeys?.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 border-2 border-dashed rounded-xl border-border/50">
            <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center">
              <KeyIcon className="size-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">No results found</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "Try a different search term" : "Generate your first API key to get started"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border/40 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-[180px]">Name</TableHead>
                  <TableHead>Bound Project</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKeys?.map((k) => (
                  <TableRow key={k._id} className="group hover:bg-muted/20 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{k.name}</span>
                        <Badge variant="outline" className="w-fit text-xs h-4 px-1 font-normal opacity-70">
                          active
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {k.projectName ? (
                        <div className="flex items-center gap-1.5">
                          <FolderIcon className="size-3 text-primary/70" />
                          <span className="font-medium text-foreground/80">{k.projectName}</span>
                        </div>
                      ) : (
                        <span className="opacity-50 italic">All projects</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      <div className="flex items-center justify-end gap-1.5">
                        <CalendarIcon className="size-3" />
                        {new Date(k._creationTime).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        className="size-8 inline-flex items-center justify-center rounded-md text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                        onClick={() => confirmRevoke(k)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        
        {/* Sentinel for Infinite Scroll */}
        {(status === "CanLoadMore" || status === "LoadingMore") && (
          <div 
            ref={sentinelRef} 
            className="flex items-center justify-center py-6 mt-2"
          >
            {status === "LoadingMore" && (
              <div className="flex flex-col items-center gap-2">
                <Spinner className="size-5" />
                <span className="text-xs text-muted-foreground animate-pulse">
                  Fetching more keys...
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
