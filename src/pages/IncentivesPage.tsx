import { useState } from "react";
import {
  Flame,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Trophy,
  Target,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIncentives, type IncentiveFormData } from "@/hooks/useIncentives";
import { useAttorneys } from "@/hooks/useAttorneys";
import { useAuth } from "@/hooks/useAuth";
import { US_STATES } from "@/lib/us-states";
import { format } from "date-fns";
import { toast } from "sonner";
import { useEffect } from "react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 border-yellow-300",
  active: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-300",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-300",
};

const defaultFormData: IncentiveFormData = {
  title: "",
  description: "",
  payout_amount: 0,
  target_type: "milestone",
  target_quantity: 1,
  end_time: "",
  rules: [{ state: "", max_sol_months: "", attorney_id: "" }],
};

export default function IncentivesPage() {
  const { incentives, loading, refetch, createIncentive, updateIncentiveStatus } = useIncentives();
  const { attorneys } = useAttorneys();
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState<IncentiveFormData>(defaultFormData);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!createOpen) {
      setFormData(defaultFormData);
    }
  }, [createOpen]);

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!formData.end_time) {
      toast.error("Expiration date/time is required");
      return;
    }
    if (formData.payout_amount <= 0) {
      toast.error("Payout amount must be greater than 0");
      return;
    }

    setSubmitting(true);
    const success = await createIncentive(formData);
    setSubmitting(false);
    if (success) setCreateOpen(false);
  };

  const handleApprove = async (id: string) => {
    await updateIncentiveStatus(id, "active");
  };

  const handleReject = async (id: string) => {
    await updateIncentiveStatus(id, "rejected");
  };

  const updateForm = (field: keyof IncentiveFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateRule = (index: number, field: string, value: string) => {
    setFormData((prev) => {
      const rules = [...prev.rules];
      rules[index] = { ...rules[index], [field]: value === "__any__" ? "" : value };
      return { ...prev, rules };
    });
  };

  const addRule = () => {
    setFormData((prev) => ({
      ...prev,
      rules: [...prev.rules, { state: "", max_sol_months: "", attorney_id: "" }],
    }));
  };

  const removeRule = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }));
  };

  const pendingIncentives = incentives.filter((i) => i.status === "pending");
  const activeIncentives = incentives.filter((i) => i.status === "active");

  return (
    <div className="min-h-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Flame className="h-6 w-6 text-orange-500" />
            <div>
              <h1 className="text-xl font-bold">Incentives & Flash Bonuses</h1>
              <p className="text-sm text-muted-foreground">
                Create, manage, and approve time-sensitive incentive campaigns
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw className="mr-1 h-4 w-4" />
              Refresh
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  New Flash Sale
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-500" />
                    Create New Flash Incentive
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Incentive Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => updateForm("title", e.target.value)}
                      placeholder='e.g. "Florida Sprint Bonus"'
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => updateForm("description", e.target.value)}
                      placeholder="Describe the challenge and what BPOs need to do"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="payout">Payout Amount ($)</Label>
                      <Input
                        id="payout"
                        type="number"
                        min={0}
                        step="0.01"
                        value={formData.payout_amount || ""}
                        onChange={(e) => updateForm("payout_amount", parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="end_time">Expires At</Label>
                      <Input
                        id="end_time"
                        type="datetime-local"
                        value={formData.end_time}
                        onChange={(e) => updateForm("end_time", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="target_type">Challenge Type</Label>
                      <Select
                        value={formData.target_type}
                        onValueChange={(v: "first_to_finish" | "milestone") =>
                          updateForm("target_type", v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="milestone">Milestone (Do X sales)</SelectItem>
                          <SelectItem value="first_to_finish">First to Finish</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="target_quantity">Target Quantity</Label>
                      <Input
                        id="target_quantity"
                        type="number"
                        min={1}
                        value={formData.target_quantity}
                        onChange={(e) =>
                          updateForm("target_quantity", parseInt(e.target.value) || 1)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Criteria Rules</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addRule}>
                        <Plus className="mr-1 h-3 w-3" />
                        Add Rule
                      </Button>
                    </div>

                    {formData.rules.map((rule, index) => (
                      <div key={index} className="flex items-start gap-2 rounded-lg border p-3">
                        <div className="grid flex-1 grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              State
                            </Label>
                            <Select
                              value={rule.state}
                              onValueChange={(v) => updateRule(index, "state", v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Any" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__any__">Any State</SelectItem>
                                {US_STATES.map((s) => (
                                  <SelectItem key={s.code} value={s.code}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              Max SOL (months)
                            </Label>
                            <Input
                              className="h-8 text-xs"
                              type="number"
                              min={0}
                              placeholder="Any"
                              value={rule.max_sol_months}
                              onChange={(e) =>
                                updateRule(index, "max_sol_months", e.target.value)
                              }
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              Attorney
                            </Label>
                            <Select
                              value={rule.attorney_id}
                              onValueChange={(v) =>
                                updateRule(index, "attorney_id", v === "__any__" ? "" : v)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Any" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__any__">Any Attorney</SelectItem>
                                {attorneys.map((a) => (
                                  <SelectItem key={a.user_id} value={a.user_id}>
                                    {a.full_name || a.primary_email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {formData.rules.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => removeRule(index)}
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleCreate}
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Submit for Approval"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending" className="relative">
              Pending Approval
              {pendingIncentives.length > 0 && (
                <Badge className="ml-2 bg-yellow-500 text-white text-[10px] px-1.5 py-0">
                  {pendingIncentives.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingIncentives.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No pending incentives awaiting approval
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingIncentives.map((incentive) => (
                  <Card key={incentive.id} className="border-l-4 border-l-yellow-500">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold">{incentive.title}</CardTitle>
                        <Badge className={STATUS_COLORS[incentive.status]}>
                          {incentive.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {incentive.description && (
                        <p className="text-muted-foreground">{incentive.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-green-500" />
                          ${Number(incentive.payout_amount).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3 text-blue-500" />
                          {incentive.target_type === "milestone"
                            ? `${incentive.target_quantity} sales`
                            : "First to finish"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-orange-500" />
                          {format(new Date(incentive.end_time), "MMM d, h:mm a")}
                        </span>
                      </div>

                      {incentive.rules && incentive.rules.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {incentive.rules.map((rule) => (
                            <Badge key={rule.id} variant="outline" className="text-[10px]">
                              {[rule.state && `State: ${rule.state}`, rule.max_sol_months && `SOL < ${rule.max_sol_months}mo`, rule.attorney_id && "Specific Atty"]
                                .filter(Boolean)
                                .join(" | ")}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleApprove(incentive.id)}
                        >
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleReject(incentive.id)}
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="active">
            {activeIncentives.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No active flash promotions right now
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeIncentives.map((incentive) => (
                  <Card key={incentive.id} className="border-l-4 border-l-green-500">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold">{incentive.title}</CardTitle>
                        <Badge className={STATUS_COLORS[incentive.status]}>
                          {incentive.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {incentive.description && (
                        <p className="text-muted-foreground">{incentive.description}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3 text-green-500" />
                        <span>${Number(incentive.payout_amount).toLocaleString()}</span>
                        <Target className="ml-2 h-3 w-3 text-blue-500" />
                        <span>
                          {incentive.target_type === "milestone"
                            ? `${incentive.target_quantity} sales`
                            : "First to finish"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Expires: {format(new Date(incentive.end_time), "MMM d, h:mm a")}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incentives.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No incentives found
                      </TableCell>
                    </TableRow>
                  ) : (
                    incentives.map((incentive) => (
                      <TableRow key={incentive.id}>
                        <TableCell className="font-medium">{incentive.title}</TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[incentive.status]}>
                            {incentive.status}
                          </Badge>
                        </TableCell>
                        <TableCell>${Number(incentive.payout_amount).toLocaleString()}</TableCell>
                        <TableCell>
                          {incentive.target_type === "milestone"
                            ? `${incentive.target_quantity} sales`
                            : "First to finish"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {format(new Date(incentive.end_time), "MMM d, h:mm a")}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {format(new Date(incentive.created_at), "MMM d, h:mm a")}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
