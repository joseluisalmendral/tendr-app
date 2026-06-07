"use client";

import { useState, useTransition, type ReactNode } from "react";

import { useRouter } from "next/navigation";
import { PlusIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import { createTemplate, updateTemplate } from "./actions";
import type { TemplateRow } from "./template-crud";
import {
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
} from "./template-limits";

/**
 * Create/Edit template dialog with a markdown body editor, a comma-separated
 * variables field, and a live markdown PREVIEW tab (react-markdown with its
 * SAFE defaults — no rehype-raw, so embedded HTML is escaped, not executed,
 * matching the notes-tab convention).
 *
 * The dialog owns only `open`; the form body lives in `TemplateForm`, which is
 * REMOUNTED via a `key` tied to the open state. Each open therefore initializes
 * its field state fresh from props (no effect, no synchronous setState in an
 * effect) — an edit dialog reflects the latest row and a reused create dialog
 * starts clean.
 */
export function TemplateFormDialog({
  template,
  trigger,
}: {
  template?: TemplateRow;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = Boolean(template);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar plantilla" : "Nueva plantilla"}
          </DialogTitle>
          <DialogDescription>
            El cuerpo soporta Markdown. Define variables como {"{{nombre}}"} y
            anótalas abajo para reutilizarlas.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <TemplateForm
            key={template?.id ?? "new"}
            template={template}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({
  template,
  onDone,
}: {
  template?: TemplateRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(template);

  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.bodyMarkdown ?? "");
  const [variablesText, setVariablesText] = useState(
    (template?.variables ?? []).join(", "),
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    setBodyError(null);

    const variables = variablesText
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    startTransition(async () => {
      const result =
        isEdit && template
          ? await updateTemplate({
              id: template.id,
              name,
              bodyMarkdown: body,
              variables,
            })
          : await createTemplate({ name, bodyMarkdown: body, variables });

      if (result.ok) {
        toast.success(isEdit ? "Plantilla actualizada" : "Plantilla creada");
        onDone();
        router.refresh();
      } else {
        setNameError(result.fieldErrors?.name ?? null);
        setBodyError(result.fieldErrors?.bodyMarkdown ?? null);
        if (!result.fieldErrors) toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="template-name">Nombre</Label>
        <Input
          id="template-name"
          value={name}
          maxLength={TEMPLATE_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(nameError)}
          required
        />
        {nameError ? (
          <p className="text-sm text-destructive">{nameError}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Cuerpo</Label>
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">Editar</TabsTrigger>
            <TabsTrigger value="preview">Vista previa</TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <Textarea
              id="template-body"
              value={body}
              rows={12}
              maxLength={TEMPLATE_BODY_MAX_LENGTH}
              onChange={(e) => setBody(e.target.value)}
              placeholder="# Propuesta para {{cliente}}…"
              aria-invalid={Boolean(bodyError)}
              className="font-mono text-sm"
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="prose prose-sm dark:prose-invert min-h-48 max-w-none rounded-md border p-4 text-sm break-words">
              {body.trim() ? (
                <ReactMarkdown>{body}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground">
                  Escribe el cuerpo para ver la vista previa.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
        {bodyError ? (
          <p className="text-sm text-destructive">{bodyError}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="template-variables">Variables</Label>
        <Input
          id="template-variables"
          value={variablesText}
          onChange={(e) => setVariablesText(e.target.value)}
          placeholder="Separadas por comas: cliente, fecha, importe"
          autoComplete="off"
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <SpinnerGapIcon className="animate-spin" data-icon="inline-start" />
          ) : (
            <PlusIcon weight="bold" data-icon="inline-start" />
          )}
          {pending
            ? "Guardando…"
            : isEdit
              ? "Guardar cambios"
              : "Crear plantilla"}
        </Button>
      </DialogFooter>
    </form>
  );
}
