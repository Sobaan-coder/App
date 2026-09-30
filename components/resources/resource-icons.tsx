import { FileImage, FileText, Globe, HardDrive, MonitorPlay, NotebookPen, Presentation, FileType } from "lucide-react";

export const RESOURCE_TYPE_META = {
  pdf: { label: "PDF", icon: FileText },
  docx: { label: "Word", icon: FileType },
  pptx: { label: "Slides", icon: Presentation },
  txt: { label: "Text", icon: FileText },
  image: { label: "Image", icon: FileImage },
  youtube: { label: "YouTube", icon: MonitorPlay },
  web: { label: "Web", icon: Globe },
  drive: { label: "Drive", icon: HardDrive },
  note: { label: "Note", icon: NotebookPen },
} as const;

export type ResourceType = keyof typeof RESOURCE_TYPE_META;

export const STATUS_META = {
  uploading: { label: "Uploading", variant: "warning" },
  processing: { label: "Processing", variant: "warning" },
  analyzing: { label: "Analyzing", variant: "warning" },
  ready: { label: "Ready", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
} as const;
