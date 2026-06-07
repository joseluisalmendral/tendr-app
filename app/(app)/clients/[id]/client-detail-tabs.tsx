"use client";

import { useOptimistic } from "react";

import { StackIcon } from "@phosphor-icons/react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CasesTab } from "./cases-tab";
import type { CaseStatus } from "./create-case";
import { DocumentsTab, type DocumentRow } from "./documents-tab";
import { NotesTab } from "./notes-tab";

export type CaseRow = {
  id: string;
  title: string;
  status: CaseStatus;
  valueCents: number | null;
  createdAt: string;
};

export type NoteRow = {
  id: string;
  body: string;
  createdAt: string;
};

/**
 * Client detail tabs (fork #2 pattern from slice B: optimistic state lives HERE,
 * at the tab-container level, so a just-created case/note appears instantly and
 * the overlay is dropped once `revalidatePath` re-renders the RSC with the
 * authoritative row).
 *
 * Casos, Notas and Documentos are functional now; Plantillas is an honest
 * "Próximamente" placeholder — that feature arrives in a later phase, so we
 * show a real empty state rather than fake UI.
 */
export function ClientDetailTabs({
  clientId,
  workspaceId,
  initialCases,
  initialNotes,
  initialDocuments,
}: {
  clientId: string;
  workspaceId: string;
  initialCases: CaseRow[];
  initialNotes: NoteRow[];
  initialDocuments: DocumentRow[];
}) {
  const [optimisticCases, addOptimisticCase] = useOptimistic(
    initialCases,
    (state: CaseRow[], newCase: CaseRow) => [newCase, ...state],
  );

  const [optimisticNotes, addOptimisticNote] = useOptimistic(
    initialNotes,
    (state: NoteRow[], newNote: NoteRow) => [newNote, ...state],
  );

  return (
    <Tabs defaultValue="cases">
      <TabsList>
        <TabsTrigger value="cases">Casos</TabsTrigger>
        <TabsTrigger value="notes">Notas</TabsTrigger>
        <TabsTrigger value="documents">Documentos</TabsTrigger>
        <TabsTrigger value="templates">Plantillas</TabsTrigger>
      </TabsList>

      <TabsContent value="cases" className="pt-4">
        <CasesTab
          clientId={clientId}
          cases={optimisticCases}
          addOptimisticCase={addOptimisticCase}
        />
      </TabsContent>

      <TabsContent value="notes" className="pt-4">
        <NotesTab
          clientId={clientId}
          notes={optimisticNotes}
          addOptimisticNote={addOptimisticNote}
        />
      </TabsContent>

      <TabsContent value="documents" className="pt-4">
        <DocumentsTab
          clientId={clientId}
          workspaceId={workspaceId}
          documents={initialDocuments}
        />
      </TabsContent>

      <TabsContent value="templates" className="pt-4">
        <Empty className="rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <StackIcon />
            </EmptyMedia>
            <EmptyTitle>Plantillas</EmptyTitle>
            <EmptyDescription>
              Próximamente vas a poder generar propuestas con plantillas IA
              desde acá.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </TabsContent>
    </Tabs>
  );
}
