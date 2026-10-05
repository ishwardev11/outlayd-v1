"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, X, Plus, Target, CheckCircle2 } from "lucide-react";
import { createProcurementProject } from "@/app/actions/procurement";
import { useRouter } from "next/navigation";
import { useRole } from "@/components/RoleProvider";
import { useCurrency } from "@/components/CurrencyProvider";

export function NewProjectForm() {
    const router = useRouter();
    const [title, setTitle] = useState("");
    const [budget, setBudget] = useState("");
    const [deadline, setDeadline] = useState("");
    const [requirementInput, setRequirementInput] = useState("");
    const [requirements, setRequirements] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { isViewer } = useRole();
    const { symbol } = useCurrency();

    const handleAddRequirement = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const val = requirementInput.trim();
            if (val && !requirements.includes(val)) {
                setRequirements([...requirements, val]);
                setRequirementInput("");
            }
        }
    };

    const removeRequirement = (reqToRemove: string) => {
        setRequirements(requirements.filter((req) => req !== reqToRemove));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        // Example structure for what would be sent to the backend:
        try {
            const data = await createProcurementProject({
                title,
                budget_ceiling: parseFloat(budget.replace(/[^0-9.]/g, '')),
                required_deadline: deadline,
                mandatory_requirements: requirements,
                status: 'Drafting'
            });

            router.push(`/procurement/${data.id}`);
        } catch (error) {
            console.error("Failed to create project:", error);
            alert("Failed to create project");
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-2xl mx-auto shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <form onSubmit={handleSubmit}>
                <CardHeader className="bg-slate-50/50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 pb-6 rounded-t-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        <CardTitle className="text-xl text-slate-900 dark:text-white">New Procurement Project</CardTitle>
                    </div>
                    <CardDescription className="text-slate-500 dark:text-slate-400">
                        Define project constraints and requirements before opening the floor to vendor bids.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6 pt-6">
                    {/* Project Title */}
                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-sm font-medium text-slate-700 dark:text-slate-300">Project Title</Label>
                        <Input
                            id="title"
                            placeholder="e.g., Annual Gala Catering"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            className="bg-white dark:bg-slate-950 dark:border-slate-800 dark:placeholder:text-slate-500 dark:text-white"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Budget Ceiling */}
                        <div className="space-y-2">
                            <Label htmlFor="budget" className="text-sm font-medium text-slate-700 dark:text-slate-300">Budget Ceiling ({symbol})</Label>
                            <div className="relative flex items-center">
                                <span className="absolute left-3 text-xs font-bold text-slate-400 dark:text-slate-500 select-none">{symbol}</span>
                                <Input
                                    id="budget"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={budget}
                                    onChange={(e) => setBudget(e.target.value)}
                                    required
                                    className="pl-11 bg-white dark:bg-slate-950 dark:border-slate-800 dark:placeholder:text-slate-500 dark:text-white"
                                />
                            </div>
                        </div>

                        {/* Deadline */}
                        <div className="space-y-2">
                            <Label htmlFor="deadline" className="text-sm font-medium text-slate-700 dark:text-slate-300">Required Delivery Date</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
                                <Input
                                    id="deadline"
                                    type="date"
                                    value={deadline}
                                    onChange={(e) => setDeadline(e.target.value)}
                                    required
                                    className="pl-9 bg-white w-full dark:bg-slate-950 dark:border-slate-800 dark:text-white [&::-webkit-calendar-picker-indicator]:dark:invert"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Mandatory Requirements */}
                    <div className="space-y-3 pt-2">
                        <div>
                            <Label htmlFor="requirements" className="text-sm font-medium text-slate-700 dark:text-slate-300">Mandatory Requirements</Label>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Type a requirement and press Enter to add (e.g. &apos;Net-30 Payment&apos;, &apos;Vegetarian Options&apos;)</p>
                            <div className="relative">
                                <Plus className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
                                <Input
                                    id="requirements"
                                    placeholder="Add a new requirement..."
                                    value={requirementInput}
                                    onChange={(e) => setRequirementInput(e.target.value)}
                                    onKeyDown={handleAddRequirement}
                                    className="pl-9 bg-white dark:bg-slate-950 dark:border-slate-800 dark:placeholder:text-slate-500 dark:text-white"
                                />
                            </div>
                        </div>

                        {/* Chips Area */}
                        {requirements.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                                {requirements.map((req, idx) => (
                                    <Badge
                                        key={idx}
                                        variant="secondary"
                                        className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800 dark:hover:bg-indigo-900/50 pl-2 pr-1 py-1 text-sm flex items-center gap-1 transition-colors"
                                    >
                                        <span>{req}</span>
                                        <button
                                            type="button"
                                            onClick={() => removeRequirement(req)}
                                            className="hover:bg-indigo-200 dark:hover:bg-indigo-800 rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                        >
                                            <X className="w-3 h-3" />
                                            <span className="sr-only">Remove {req}</span>
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>

                <CardFooter className="bg-slate-50/50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 p-6 rounded-b-xl flex justify-end">
                    <Button
                        type="submit"
                        disabled={isSubmitting || !title || !budget || !deadline || isViewer}
                        title={isViewer ? "Viewers cannot create projects" : ""}
                        className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white min-w-60 shadow-sm transition-all"
                    >
                        {isSubmitting ? (
                            "Creating Project..."
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Create Project & Start Collecting Bids
                            </>
                        )}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
