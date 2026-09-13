import type { PageInfo } from "../types";

export function generatePageLoadState(hasPageLoad: boolean, pageLoadDataType: string = "JSONValue"): string {
  if (!hasPageLoad) return "";
  return `  const [pageLoadData, setPageLoadData] = useState<${pageLoadDataType}>(null);
  const [pageLoadLoading, setPageLoadLoading] = useState<boolean>(false);
  const [pageLoadError, setPageLoadError] = useState<string | null>(null);

`;
}

export function generatePageLoadEffect(
  hasPageLoad: boolean,
  pageMeta: PageInfo,
  pageLoadFetchStatements: string,
): string {
  if (!hasPageLoad) return "";
  return `  // Auto-fetch data on page load for ${pageMeta.label}
  useEffect(() => {
    let isMounted = true;
    async function loadPageData() {
      setPageLoadLoading(true);
      setPageLoadError(null);
      try {
        ${pageLoadFetchStatements}
      } catch (err) {
        if (isMounted) {
          setPageLoadError(err instanceof Error ? err.message : "Failed to load page data");
        }
      } finally {
        if (isMounted) {
          setPageLoadLoading(false);
        }
      }
    }
    loadPageData();
    return () => {
      isMounted = false;
    };
  }, []);

`;
}

export function generatePageLoadSection(hasPageLoad: boolean): string {
  if (!hasPageLoad) return "";
  return `        {/* Section: Page Load Data */}
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg font-bold text-card-foreground">Page Load Data</CardTitle>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">
              {pageLoadLoading ? "Loading..." : pageLoadError ? "Error" : "Loaded"}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 border border-border rounded-lg p-4 font-mono text-sm text-foreground overflow-x-auto shadow-inner min-h-[120px]">
              <pre className="whitespace-pre-wrap font-mono">
                {pageLoadLoading
                  ? "// Loading page data from API endpoint..."
                  : pageLoadError
                  ? "// Error: " + pageLoadError
                  : pageLoadData !== null
                  ? JSON.stringify(pageLoadData, null, 2)
                  : "// No pageLoad data available."}
              </pre>
            </div>
          </CardContent>
        </Card>

`;
}

export function generateJsonValueTypeDecl(hasPageLoad: boolean): string {
  if (!hasPageLoad) return "";
  return `type JSONPrimitive = string | number | boolean | null;
type JSONObject = { [key: string]: JSONValue };
type JSONArray = JSONValue[];
type JSONValue = JSONPrimitive | JSONObject | JSONArray;

`;
}
