export type CloudboxResponse = {
  computer: {
    name: string;
    persona: string;
    profile: {
      identity: string;
      occupation: string;
      organization: string;
      responsibilities: string[];
      currentProjects: string[];
    };
    filesystem: {
      files: Array<{ id: string; path: string; kind: string; title: string; description: string }>;
    };
    collaborators: Array<{ name: string; role: string }>;
    simulation: {
      period: { workingDays: number };
      activities: Array<{ day: number; summary: string }>;
      deliverables: Array<{ title: string; status: string }>;
    };
  };
  retrospective: {
    percentage: number;
    summary: string;
    lessons: string[];
    failureModes: string[];
  };
  links: {
    export: string;
    artifacts: Array<{ id: string; path: string; href: string }>;
  };
};

export async function getDemo(): Promise<CloudboxResponse> {
  const response = await fetch("/api/demo");
  if (!response.ok) throw new Error("Demo request failed");
  return response.json();
}

export async function provisionWorkspace(text: string): Promise<CloudboxResponse> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, mode: "short" }),
  });
  if (!response.ok) throw new Error("Provision request failed");
  return response.json();
}
