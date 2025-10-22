import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGlobalProfile } from "@/hooks/useGlobalProfile";
import { Save, Image as ImageIcon, Upload, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import defaultProfileImage from "@/assets/default-profile.png";
import defaultCoverImage from "@/assets/default-cover-image.png";

const Settings = () => {
  const { settings, isLoading, updateSettings } = useGlobalProfile();
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [category, setCategory] = useState("");
  const [info, setInfo] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const handleImageUpload = async (file: File, type: 'profile' | 'cover') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const bucket = type === 'profile' ? 'profile-images' : 'cover-images';

      if (type === 'profile') setUploadingProfile(true);
      else setUploadingCover(true);

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      if (type === 'profile') setProfileImage(publicUrl);
      else setCoverImage(publicUrl);

      toast.success(`${type === 'profile' ? 'Profilbild' : 'Titelbild'} hochgeladen`);
    } catch (error: any) {
      toast.error(`Fehler beim Hochladen: ${error.message}`);
    } finally {
      if (type === 'profile') setUploadingProfile(false);
      else setUploadingCover(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setProfileName(settings.global_profile_name || "smilework");
      setProfileEmail(settings.global_profile_email || "");
      setProfileImage(settings.global_profile_image || defaultProfileImage);
      setCoverImage(settings.global_profile_cover_image || defaultCoverImage);
      setCategory(settings.global_profile_category || "Arbeitsvermittlung");
      setInfo(settings.global_profile_info || "");
      setDescription(settings.global_profile_description || "");
      setWebsite(settings.global_profile_website || "");
      setAddress(settings.global_profile_address || "");
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings.mutateAsync({
      global_profile_name: profileName,
      global_profile_email: profileEmail,
      global_profile_image: profileImage,
      global_profile_cover_image: coverImage,
      global_profile_category: category,
      global_profile_info: info,
      global_profile_description: description,
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
              <Label htmlFor="profileName">Unternehmens Name</Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="z.B. smilework"
              />
              <p className="text-xs text-muted-foreground">
                Dieser Name wird als Anzeigename für alle WhatsApp-Accounts verwendet
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profileEmail">E-Mail-Adresse</Label>
              <Input
                id="profileEmail"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                placeholder="kontakt@beispiel.de"
              />
              <p className="text-xs text-muted-foreground">
                E-Mail-Adresse für das WhatsApp Business-Profil
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profileImage">Profilbild</Label>
              <div className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <Input
                    id="profileImage"
                    value={profileImage}
                    onChange={(e) => setProfileImage(e.target.value)}
                    placeholder="https://example.com/profilbild.jpg oder hochladen"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingProfile}
                      onClick={() => document.getElementById('profile-upload')?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadingProfile ? "Lädt..." : "Hochladen"}
                    </Button>
                    {profileImage && !profileImage.startsWith('/src/') && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setProfileImage("")}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Entfernen
                      </Button>
                    )}
                  </div>
                  <input
                    id="profile-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file, 'profile');
                    }}
                  />
                </div>
                {profileImage && (
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
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
                Bild hochladen oder URL eingeben - wird auf alle WhatsApp-Accounts angewendet
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverImage">Titelbild</Label>
              <div className="space-y-2">
                <Input
                  id="coverImage"
                  value={coverImage}
                  onChange={(e) => setCoverImage(e.target.value)}
                  placeholder="https://example.com/titelbild.jpg oder hochladen"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingCover}
                    onClick={() => document.getElementById('cover-upload')?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploadingCover ? "Lädt..." : "Hochladen"}
                  </Button>
                  {coverImage && !coverImage.startsWith('/src/') && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCoverImage("")}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Entfernen
                    </Button>
                  )}
                </div>
                <input
                  id="cover-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file, 'cover');
                  }}
                />
                {coverImage && (
                  <div className="w-full h-32 rounded-lg overflow-hidden border-2 border-border">
                    <img
                      src={coverImage}
                      alt="Titelbild Vorschau"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = "";
                      }}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Bild hochladen oder URL eingeben - wird auf alle WhatsApp Business-Profile angewendet
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Kategorie</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="z.B. Arbeitsvermittlung"
              />
              <p className="text-xs text-muted-foreground">
                Geschäftskategorie für das WhatsApp Business-Profil
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="info">Info (WhatsApp Status)</Label>
              <Textarea
                id="info"
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                placeholder="z.B. wir finden den passenden Job für Dich"
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground">
                Status-Text, der in WhatsApp als "Info" angezeigt wird
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beschreibung (Business-Profil)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ausführliche Beschreibung für das Business-Profil"
                className="min-h-[100px]"
              />
              <p className="text-xs text-muted-foreground">
                Beschreibung für das WhatsApp Business-Profil (separat vom Status)
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
