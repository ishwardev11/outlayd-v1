import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, FileWarning, TrendingUp } from "lucide-react";

export default function Home() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Morning briefing and action queue.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Payment</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$12,450.00</div>
            <p className="text-xs text-muted-foreground">+20.1% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Needs Review</CardTitle>
            <FileWarning className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">14</div>
            <p className="text-xs text-muted-foreground">7 high priority invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Fund Activity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">Summer Youth</div>
            <p className="text-xs text-muted-foreground">34% of total volume this week</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4 text-slate-800">Action Queue</h2>
        <Card>
          <div className="p-0">
            <div className="divide-y divide-border">
              {[
                { vendor: "Staples", amount: "$124.50", status: "Needs Review", urgent: true },
                { vendor: "AWS Services", amount: "$840.00", status: "Needs Review", urgent: true },
                { vendor: "Local Caterer", amount: "$450.00", status: "Awaiting Payment", urgent: false },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium">
                      {item.vendor.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">{item.vendor}</p>
                      <p className="text-sm text-muted-foreground mt-1">{item.amount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.urgent && <Badge variant="destructive">Urgent</Badge>}
                    <Badge variant={item.status === "Needs Review" ? "outline" : "secondary"}>
                      {item.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
