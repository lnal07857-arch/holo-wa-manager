import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Edit, Trash2, GripVertical, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useTemplates } from "@/hooks/useTemplates";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const SortableTemplate = ({ template, onEdit, onDelete, onToggleForChats }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: template.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="hover:shadow-lg transition-all">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 flex-1">
              <button
                className="mt-1 cursor-grab active:cursor-grabbing touch-none"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="w-5 h-5 text-muted-foreground" />
              </button>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {template.template_name}
                  {template.for_chats && (
                    <Badge variant="default" className="text-xs gap-1">
                      <MessageSquare className="w-3 h-3" />
                      Chat
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{template.category}</CardDescription>
              </div>
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
              {template.placeholders.map((placeholder: string) => (
                <Badge key={placeholder} variant="outline" className="text-xs">
                  {`{{${placeholder}}}`}
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-2 border-t">
              <div className="flex items-center space-x-2 flex-1">
                <Checkbox
                  id={`chat-${template.id}`}
                  checked={template.for_chats}
                  onCheckedChange={() => onToggleForChats(template.id, !template.for_chats)}
                />
                <label
                  htmlFor={`chat-${template.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Für Chats verwenden
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1">
                <Copy className="w-3 h-3" />
                Kopieren
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => onEdit(template.id)}
              >
                <Edit className="w-3 h-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-destructive hover:text-destructive"
                onClick={() => onDelete(template.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const Templates = () => {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate, reorderTemplates } = useTemplates();
  const [localTemplates, setLocalTemplates] = useState(templates);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("");
  const [templateText, setTemplateText] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update local templates when templates change
  useEffect(() => {
    setLocalTemplates(templates);
  }, [templates]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localTemplates.findIndex((t) => t.id === active.id);
      const newIndex = localTemplates.findIndex((t) => t.id === over.id);

      const newOrder = arrayMove(localTemplates, oldIndex, newIndex);
      setLocalTemplates(newOrder);

      // Update display_order in database
      const reorderedData = newOrder.map((template, index) => ({
        id: template.id,
        display_order: index,
      }));
      
      reorderTemplates.mutate(reorderedData);
    }
  };

  const handleToggleForChats = async (templateId: string, forChats: boolean) => {
    await updateTemplate.mutateAsync({
      templateId,
      template: {
        template_name: localTemplates.find(t => t.id === templateId)!.template_name,
        category: localTemplates.find(t => t.id === templateId)!.category,
        template_text: localTemplates.find(t => t.id === templateId)!.template_text,
        placeholders: localTemplates.find(t => t.id === templateId)!.placeholders,
        for_chats: forChats,
      },
    });
  };

  const extractPlaceholders = (text: string): string[] => {
    const matches = text.match(/\{\{([^}]+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.slice(2, -2)))];
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

  const handleEdit = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      setEditingTemplate(templateId);
      setTemplateName(template.template_name);
      setCategory(template.category);
      setTemplateText(template.template_text);
      setEditOpen(true);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    const placeholders = extractPlaceholders(templateText);
    await updateTemplate.mutateAsync({
      templateId: editingTemplate,
      template: {
        template_name: templateName,
        category,
        template_text: templateText,
        placeholders,
      },
    });
    setTemplateName("");
    setCategory("");
    setTemplateText("");
    setEditingTemplate(null);
    setEditOpen(false);
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
                    placeholder="Verwenden Sie {{Platzhalter}} für dynamische Inhalte"
                    className="min-h-[200px]"
                    required
                  />
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Erkannte Platzhalter:</p>
                  <div className="flex flex-wrap gap-2">
                    {extractPlaceholders(templateText).map((placeholder) => (
                      <Badge key={placeholder} variant="secondary">
                        {`{{${placeholder}}}`}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vorlage bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editTemplateName">Vorlagen-Name</Label>
                  <Input
                    id="editTemplateName"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="z.B. Terminbestätigung"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editCategory">Kategorie</Label>
                  <Input
                    id="editCategory"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="z.B. Termine"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="editTemplateText">Nachrichtentext</Label>
                <Textarea
                  id="editTemplateText"
                  value={templateText}
                  onChange={(e) => setTemplateText(e.target.value)}
                  placeholder="Verwenden Sie {{Platzhalter}} für dynamische Inhalte"
                  className="min-h-[200px]"
                  required
                />
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Erkannte Platzhalter:</p>
                <div className="flex flex-wrap gap-2">
                  {extractPlaceholders(templateText).map((placeholder) => (
                    <Badge key={placeholder} variant="secondary">
                      {`{{${placeholder}}}`}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full">
                Vorlage aktualisieren
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={localTemplates.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {localTemplates.map((template) => (
              <SortableTemplate
                key={template.id}
                template={template}
                onEdit={handleEdit}
                onDelete={(id: string) => deleteTemplate.mutate(id)}
                onToggleForChats={handleToggleForChats}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default Templates;
