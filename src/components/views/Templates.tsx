import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTemplates } from "@/hooks/useTemplates";

const Templates = () => {
  const { templates, isLoading, createTemplate, deleteTemplate } = useTemplates();
  const [open, setOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("");
  const [templateText, setTemplateText] = useState("");

  const extractPlaceholders = (text: string): string[] => {
    const matches = text.match(/\{([^}]+)\}/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const placeholders = extractPlaceholders(templateText);
    await createTemplate.mutateAsync({
      template_name: templateName,
      category,
      template_text: templateText,
      placeholders,
    });
    setTemplateName("");
    setCategory("");
    setTemplateText("");
    setOpen(false);
  };

  if (isLoading) {
    return <div>Lädt...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Nachrichtenvorlagen</h2>
          <p className="text-muted-foreground">Erstellen und verwalten Sie wiederverwendbare Vorlagen</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Neue Vorlage
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Neue Vorlage erstellen</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="templateName">Vorlagen-Name</Label>
                    <Input
                      id="templateName"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="z.B. Terminbestätigung"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Kategorie</Label>
                    <Input
                      id="category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="z.B. Termine"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="templateText">Nachrichtentext</Label>
                  <Textarea
                    id="templateText"
                    value={templateText}
                    onChange={(e) => setTemplateText(e.target.value)}
                    placeholder="Verwenden Sie {Platzhalter} für dynamische Inhalte"
                    className="min-h-[200px]"
                    required
                  />
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Erkannte Platzhalter:</p>
                  <div className="flex flex-wrap gap-2">
                    {extractPlaceholders(templateText).map((placeholder) => (
                      <Badge key={placeholder} variant="secondary">
                        {`{${placeholder}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  Vorlage erstellen
                </Button>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id} className="hover:shadow-lg transition-all">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{template.template_name}</CardTitle>
                  <CardDescription>{template.category}</CardDescription>
                </div>
                <Badge variant="secondary">{template.placeholders.length} Platzhalter</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {template.template_text}
                </div>
                <div className="flex flex-wrap gap-1">
                  {template.placeholders.map((placeholder) => (
                    <Badge key={placeholder} variant="outline" className="text-xs">
                      {`{${placeholder}}`}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1">
                    <Copy className="w-3 h-3" />
                    Kopieren
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => deleteTemplate.mutate(template.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Templates;
