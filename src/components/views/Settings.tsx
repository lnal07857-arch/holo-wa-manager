import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGlobalProfile } from "@/hooks/useGlobalProfile";
import { Save, Image as ImageIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const Settings = () => {
  const { settings, isLoading, updateSettings } = useGlobalProfile();
  const [profileName, setProfileName] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (settings) {
      setProfileName(settings.global_profile_name || "");
      setProfileImage(settings.global_profile_image || "");
      setWebsite(settings.global_profile_website || "");
      setAddress(settings.global_profile_address || "");
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      global_profile_name: profileName,
      global_profile_image: profileImage,
      global_profile_website: website,
      global_profile_address: address,
    });
  };

  if (isLoading) {
    return <div>Lädt...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Einstellungen</h2>
        <p className="text-muted-foreground">
          Globale Profil-Einstellungen für alle WhatsApp-Accounts
        </p>
      </div>

      <Alert>
        <AlertDescription>
          Diese Einstellungen werden automatisch auf alle WhatsApp-Accounts angewendet und bei
          Reaktivierung eines Accounts übernommen.
        </AlertDescription>
      </Alert>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Globale Profil-Daten</CardTitle>
            <CardDescription>
              Legen Sie Name, Profilbild, Website und Adresse für alle Accounts fest
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="profileName">Profil-Name</Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="z.B. Max Mustermann"
              />
              <p className="text-xs text-muted-foreground">
                Dieser Name wird als Anzeigename für alle WhatsApp-Accounts verwendet
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profileImage">Profilbild-URL</Label>
              <div className="flex gap-2">
                <Input
                  id="profileImage"
                  value={profileImage}
                  onChange={(e) => setProfileImage(e.target.value)}
                  placeholder="https://example.com/profilbild.jpg"
                  className="flex-1"
                />
                {profileImage && (
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
                    <img
                      src={profileImage}
                      alt="Vorschau"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "";
                      }}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                URL zu einem Profilbild, das für alle Accounts verwendet werden soll
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
              <p className="text-xs text-muted-foreground">
                Website-URL für das WhatsApp Business-Profil
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Adresse</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Musterstraße 123&#10;12345 Musterstadt&#10;Deutschland"
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                Geschäftsadresse für das WhatsApp Business-Profil
              </p>
            </div>

            <Button type="submit" size="lg" className="w-full gap-2">
              <Save className="w-4 h-4" />
              Einstellungen speichern
            </Button>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Hinweise zur Verwendung</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            ✓ Diese Einstellungen werden automatisch auf alle verbundenen WhatsApp-Accounts
            angewendet
          </p>
          <p>
            ✓ Bei Reaktivierung eines gesperrten Accounts werden diese Daten automatisch
            übernommen
          </p>
          <p>✓ Alle Accounts laufen unter identischen Profil-Informationen</p>
          <p>
            ⚠️ Für die automatische Anwendung ist eine Verbindung zum selbst-gehosteten
            WhatsApp-Web-Server erforderlich
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
