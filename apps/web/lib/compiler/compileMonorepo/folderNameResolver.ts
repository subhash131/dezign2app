// ═══════════════════════════════════════════════════════════════════════════
// MODULE:  folderNameResolver
// LAYER:   resolvers
// PURPOSE: Generates and deduplicates folder names for service apps and
//          web-app clients. Encapsulates counter state so callers don't
//          need to maintain a shared registry.
// ═══════════════════════════════════════════════════════════════════════════

/** Minimal shape stored in the shared folder-name registries. */
export interface FolderEntry {
  id: string;
  name: string;
  folderName: string;
}

/** The pair of resolver closures returned by {@link createFolderNameResolvers}. */
export interface FolderNameResolvers {
  /**
   * Returns a unique kebab-case folder name for a service or LangGraph node.
   * Appends `-2`, `-3`, … when the base slug already exists.
   */
  getUniqueServiceFolder: (label: string, defaultName: string) => string;

  /**
   * Returns a unique kebab-case folder name for a web-app client.
   * Appends `-2`, `-3`, … when the base slug already exists.
   */
  getUniqueWebAppFolder: (slug: string, defaultName: string) => string;

  /**
   * Returns a unique kebab-case folder name for a storage package.
   * Appends `-2`, `-3`, … when the base slug already exists.
   */
  getUniqueStorageFolder: (label: string, defaultName: string) => string;

  /** All service / langgraph folder entries registered so far. */
  servicesInfo: FolderEntry[];

  /** All web-app client folder entries registered so far. */
  webClientsInfo: FolderEntry[];

  /** All storage folder entries registered so far. */
  storageInfo: FolderEntry[];
}

/**
 * Creates a pair of folder-name resolver functions backed by shared registries.
 *
 * Usage:
 * ```ts
 * const { getUniqueServiceFolder, getUniqueWebAppFolder, servicesInfo, webClientsInfo }
 *   = createFolderNameResolvers();
 *
 * // Pre-populate during planning pass:
 * const folderName = getUniqueServiceFolder(node.data.label, "service");
 * servicesInfo.push({ id: node.id, name: rawName, folderName });
 * ```
 *
 * @debugTag folder-resolver-step-0
 */
export function createFolderNameResolvers(): FolderNameResolvers {
  const servicesInfo: FolderEntry[] = [];
  const webClientsInfo: FolderEntry[] = [];
  const storageInfo: FolderEntry[] = [];

  /**
   * Converts a label into a kebab-case base slug and appends a numeric
   * suffix until the name is unique within `servicesInfo`.
   */
  function getUniqueServiceFolder(label: string, defaultName: string): string {
    const base =
      (label || defaultName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || defaultName;

    let folderName = base;
    let counter = 1;
    // ✦ dedup loop — increments suffix until folderName is unique across all apps/ (services & web-apps)
    while (
      servicesInfo.some((s) => s.folderName === folderName) ||
      webClientsInfo.some((w) => w.folderName === folderName)
    ) {
      counter++;
      folderName = `${base}-${counter}`;
    }
    return folderName;
  }

  /**
   * Converts a slug into a kebab-case base and appends a numeric suffix
   * until the name is unique within both webClientsInfo and servicesInfo.
   */
  function getUniqueWebAppFolder(slug: string, defaultName: string): string {
    const base =
      (slug || defaultName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || defaultName;

    let folderName = base;
    let counter = 1;
    // ✦ dedup loop — increments suffix until folderName is unique across all apps/
    while (
      webClientsInfo.some((w) => w.folderName === folderName) ||
      servicesInfo.some((s) => s.folderName === folderName)
    ) {
      counter++;
      folderName = `${base}-${counter}`;
    }
    return folderName;
  }

  /**
   * Converts a storage label into a kebab-case base and appends a numeric suffix
   * until the name is unique within `storageInfo`.
   */
  function getUniqueStorageFolder(label: string, defaultName: string): string {
    const base =
      (label || defaultName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || defaultName;

    let folderName = base;
    let counter = 1;
    // ✦ dedup loop — increments suffix until folderName is unique
    while (storageInfo.some((s) => s.folderName === folderName)) {
      counter++;
      folderName = `${base}-${counter}`;
    }
    return folderName;
  }

  return {
    getUniqueServiceFolder,
    getUniqueWebAppFolder,
    getUniqueStorageFolder,
    servicesInfo,
    webClientsInfo,
    storageInfo,
  };
}
