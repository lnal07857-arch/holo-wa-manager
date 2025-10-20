import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const Templates = () => {
  const [templates] = useState([
    {
      id: 1,
      name: "Terminbestätigung",
      text: "Hallo {Name},\n\nIhr Termin am {Datum} um {Uhrzeit} wurde bestätigt.\n\nMit freundlichen Grüßen",
      category: "Termine",
      placeholders: ["Name", "Datum", "Uhrzeit"],
    },
    {
      id: 2,
      name: "Rechnungserinnerung",
      text: "Sehr geehrte/r {Anrede} {Name},\n\ndie Rechnung {Rechnungsnummer} über {Betrag}€ ist noch offen.\n\nBitte überweisen Sie den Betrag bis zum {Fälligkeitsdatum}.",
      category: "Finanzen",
      placeholders: ["Anrede", "Name", "Rechnungsnummer", "Betrag", "Fälligkeitsdatum"],
    },
    {
      id: 3,
      name: "Willkommensnachricht",
      text: "Herzlich Willkommen {Name}!\n\nSchön, dass Sie bei uns sind. Ihre Kundennummer lautet: {Kundennummer}",
      category: "Onboarding",
      placeholders: ["Name", "Kundennummer"],
    },
  ]);

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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="templateName">Vorlagen-Name</Label>
                  <Input id="templateName" placeholder="z.B. Terminbestätigung" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Kategorie</Label>
                  <Input id="category" placeholder="z.B. Termine" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="templateText">Nachrichtentext</Label>
                <Textarea
                  id="templateText"
                  placeholder="Verwenden Sie {Platzhalter} für dynamische Inhalte"
                  className="min-h-[200px]"
                />
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">Verfügbare Platzhalter:</p>
                <div className="flex flex-wrap gap-2">
                  {["Name", "Datum", "Uhrzeit", "Betrag", "Kundennummer"].map((placeholder) => (
                    <Badge key={placeholder} variant="secondary">
                      {`{${placeholder}}`}
                    </Badge>
                  ))}
                </div>
              </div>
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
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <CardDescription>{template.category}</CardDescription>
                </div>
                <Badge variant="secondary">{template.placeholders.length} Platzhalter</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {template.text}
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
                  <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive">
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
