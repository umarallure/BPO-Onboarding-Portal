import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  buildCountryOptions,
  CENTER_FILTER_ALL,
  COMPANY_SIZE_OPTIONS,
} from "@/lib/centerFilters";
import { Pencil, RefreshCw, SlidersHorizontal, StickyNote, X } from "lucide-react";
import { ChallengeBoard } from "@/components/ChallengeBoard";

const BPO_PORTAL_COLUMNS = Array.from({ length: 8 }, (_, index) => `placeholder-column-${index + 1}`);

const BpoPortalPage = () => {
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [countryFilter, setCountryFilter] = useState(CENTER_FILTER_ALL);
  const [companySizeFilter, setCompanySizeFilter] = useState(CENTER_FILTER_ALL);
  const { centers } = useCenters();

  const countryOptions = useMemo(() => buildCountryOptions(centers), [centers]);
  const hasActiveFilters =
    countryFilter !== CENTER_FILTER_ALL || companySizeFilter !== CENTER_FILTER_ALL;

  const handleClearFilters = () => {
    setCountryFilter(CENTER_FILTER_ALL);
    setCompanySizeFilter(CENTER_FILTER_ALL);
    setShowFilterRow(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <ChallengeBoard />

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(300px,1fr)_auto_auto]">
                <div className="space-y-2">
                  <Label className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Search
                  </Label>
                  <Input placeholder="Text Here" className="w-full" readOnly />
                </div>

                <Button
                  type="button"
                  variant={showFilterRow ? "default" : "outline"}
                  className="gap-2 xl:self-end"
                  onClick={() => setShowFilterRow((prev) => !prev)}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filter
                </Button>
                {hasActiveFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="gap-2 xl:self-end"
                    onClick={handleClearFilters}
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                ) : (
                  <div className="hidden xl:block" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="px-3 py-1">
                  Text Here
                </Badge>
                <Button type="button">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
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

          <div className="mt-4 min-h-0 flex-1 overflow-auto">
            <div className="p-4">
              <div
                className="flex min-h-0 gap-3 pr-2"
                style={{ minWidth: `${BPO_PORTAL_COLUMNS.length * 18}rem` }}
              >
                {BPO_PORTAL_COLUMNS.map((column) => (
                  <Card key={column} className="flex min-h-[560px] w-[26rem] flex-col bg-muted/20">
                    <CardHeader className="flex flex-row items-center justify-between border-b px-3 py-2">
                      <CardTitle className="text-sm font-semibold">Text Here</CardTitle>
                      <Badge variant="secondary">1</Badge>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                      <Card className="w-full transition">
                        <CardContent className="p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">Text Here</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <span>Text Here</span>
                                  <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                                    <StickyNote className="h-3.5 w-3.5" />
                                    <span>1</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0">
                              <Button variant="outline" size="icon" className="h-7 w-7" type="button">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <Badge variant="secondary" className="text-xs">
                              Text Here
                            </Badge>
                            <div className="text-xs text-muted-foreground">Text Here</div>
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                            <div>
                              <span className="font-medium">Text Here:</span> Text Here
                            </div>
                            <div>
                              <span className="font-medium">Text Here:</span> Text Here
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </CardContent>
                    <div className="flex items-center justify-between border-t px-3 py-2">
                      <Button variant="outline" size="sm" type="button">
                        Previous
                      </Button>
                      <div className="text-xs text-muted-foreground">Page 1 of 1</div>
                      <Button variant="outline" size="sm" type="button">
                        Next
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BpoPortalPage;
