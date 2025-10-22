import React, { createContext, useContext } from "react";
import { useMessages } from "@/hooks/useMessages";

// Provides a single shared instance of useMessages across the app
const MessagesContext = createContext<ReturnType<typeof useMessages> | undefined>(undefined);

export const MessagesProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useMessages();
  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
};

export const useMessagesContext = () => {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error("useMessagesContext must be used within a MessagesProvider");
  return ctx;
};
