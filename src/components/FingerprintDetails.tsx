import { useState, useEffect } from "react";
import { Monitor, Cpu, Clock, Globe, Loader2 } from "lucide-react";
import { useFingerprint } from "@/hooks/useFingerprint";

interface FingerprintDetailsProps {
  accountId: string;
}

export const FingerprintDetails = ({ accountId }: FingerprintDetailsProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const { data: fingerprintData, isLoading } = useFingerprint(accountId, isOpen);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm">Lade Fingerprint...</span>
      </div>
    );
  }

  if (!fingerprintData) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <p className="text-sm">Keine Fingerprint-Daten verfügbar</p>
      </div>
    );
  }

  const { fingerprint } = fingerprintData;

  return (
    <div className="space-y-3">
      {/* User-Agent */}
      <div className="bg-muted/30 p-3 rounded-lg">
        <h5 className="text-sm font-semibold mb-2">User-Agent</h5>
        <p className="font-mono text-xs break-all text-muted-foreground">
          {fingerprint.userAgent}
        </p>
      </div>

      {/* Geräteinformationen */}
      <div className="bg-muted/30 p-3 rounded-lg">
        <h5 className="text-sm font-semibold mb-2">Geräteinformationen</h5>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Monitor className="w-3 h-3" />
              Auflösung
            </p>
            <p className="font-mono text-sm">
              {fingerprint.resolution.width} x {fingerprint.resolution.height}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Cpu className="w-3 h-3" />
              CPU Kerne
            </p>
            <p className="font-mono text-sm">{fingerprint.cores}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
              <Clock className="w-3 h-3" />
              Zeitzone
            </p>
            <p className="font-mono text-sm">{fingerprint.timezone}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
