import { useMemo, useState } from "react";
import { ArrowLeftRight, Calendar, PhoneCall, Users } from "lucide-react";

import LogoLoader from "@/components/LogoLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCenters } from "@/hooks/useCenters";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { getMarketingStageDisplayLabel, isHiddenMarketingStage } from "@/lib/bpo";
import {
  buildCountryOptions,
  CENTER_FILTER_ALL,
  COMPANY_SIZE_OPTIONS,
} from "@/lib/centerFilters";

type ViewMode = "kanban" | "list";

type BoardStage = {
  key: string;
  label: string;
  columnClass: string;
};

const FALLBACK_MARKETING_STAGES: BoardStage[] = [
  { key: "contacted", label: "Contacted", columnClass: "" },
  { key: "qualified", label: "Qualified", columnClass: "" },
  { key: "scheduled_for_zoom", label: "Scheduled for Zoom", columnClass: "" },
  { key: "scheduled_for_onboarding", label: "Scheduled for Onboarding", columnClass: "" },
];

const getBoardStageLabel = (label: string) => {
  const displayLabel = getMarketingStageDisplayLabel(label);
  const cleanedLabel = displayLabel
    .replace(/\s*\(Confirmed[^)]*\)\s*/i, "")
    .replace(/\b[Ll]awyers?\b/g, "Opportunities")
    .trim();

  return cleanedLabel || displayLabel;
};

const TransferPortalPage = () => {
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [countryFilter, setCountryFilter] = useState(CENTER_FILTER_ALL);
  const [companySizeFilter, setCompanySizeFilter] = useState(CENTER_FILTER_ALL);
  const { stages: dbTransferStages, loading: stagesLoading } = usePipelineStages("cold_call_pipeline");
  const { centers } = useCenters();

  const kanbanStages = useMemo<BoardStage[]>(() => {
    const stages = dbTransferStages
      .filter((stage) => !isHiddenMarketingStage(stage))
      .map((stage) => ({
        key: stage.key,
        label: getBoardStageLabel(stage.label),
        columnClass: stage.column_class || "",
      }));

    return stages.length > 0 ? stages : FALLBACK_MARKETING_STAGES;
  }, [dbTransferStages]);

  const countryOptions = useMemo(() => buildCountryOptions(centers), [centers]);
  const hasActiveFilters =
    countryFilter !== CENTER_FILTER_ALL || companySizeFilter !== CENTER_FILTER_ALL;

  const handleClearFilters = () => {
    setCountryFilter(CENTER_FILTER_ALL);
    setCompanySizeFilter(CENTER_FILTER_ALL);
    setShowFilterRow(false);
  };

  if (stagesLoading) {
    return <LogoLoader page label="Loading marketing pipeline..." />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Opportunities</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">0</div>
                <ArrowLeftRight className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Contacted</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">0</div>
                <Users className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled for Zoom</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">0</div>
                <PhoneCall className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled for Onboarding</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="text-3xl font-semibold">0</div>
                <Calendar className="h-10 w-10 text-primary" />
              </CardContent>
            </Card>
          </div>

          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="inline-flex w-full rounded-lg border border-muted bg-background p-0.5 sm:w-auto">
                  {(["kanban", "list"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition sm:flex-none ${
                        viewMode === mode
                          ? "bg-primary text-white shadow"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => setViewMode(mode)}
                    >
                      {mode === "kanban" ? "Kanban View" : "List View"}
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant={showFilterRow ? "default" : "outline"}
                  onClick={() => setShowFilterRow((prev) => !prev)}
                >
                  Filter
                </Button>
                {hasActiveFilters ? (
                  <Button type="button" variant="ghost" onClick={handleClearFilters}>
                    Clear
                  </Button>
                ) : null}
              </div>

              <Badge variant="secondary" className="w-fit px-2.5 py-1">
                0 opportunities
              </Badge>
            </div>

            {showFilterRow && (
              <div className="mt-4 border-t pt-4">
                <div className="grid gap-3 xl:grid-cols-[repeat(2,minmax(180px,1fr))]">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Country</Label>
                    <Select value={countryFilter} onValueChange={setCountryFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Countries" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={CENTER_FILTER_ALL}>All Countries</SelectItem>
                          {countryOptions.map((country) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Company Size</Label>
                    <Select value={companySizeFilter} onValueChange={setCompanySizeFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All Sizes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={CENTER_FILTER_ALL}>All Sizes</SelectItem>
                          {COMPANY_SIZE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {viewMode === "kanban" ? (
            <div className="mt-4 min-h-0 flex-1 overflow-auto">
              <div className="flex min-h-0 min-w-max gap-3 pr-2">
                {kanbanStages.map((stage) => (
                  <Card
                    key={stage.key}
                    className={`flex min-h-[560px] w-[26rem] flex-col bg-muted/20 ${stage.columnClass}`}
                  >
                    <CardHeader className="flex flex-row items-center justify-between border-b px-3 py-2">
                      <CardTitle className="text-sm font-semibold">{stage.label}</CardTitle>
                      <Badge variant="secondary">0</Badge>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 p-2">
                      <div className="rounded-md border border-dashed border-muted-foreground/30 px-3 py-6 text-center text-xs text-muted-foreground">
                        No opportunities
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-base font-semibold">Opportunities (0)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="py-10 text-center text-muted-foreground">
                  No opportunities found.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransferPortalPage;
