import type { StructureBuilder } from "sanity/structure";
import {
  Settings,
  FileText,
  BookOpen,
  Trophy,
  Building2,
  Route,
  Layers,
  Target,
  GitCompare,
  Plug,
  Wrench,
  File,
  User,
  Folder,
  Tag as TagIcon,
  Quote,
  Sparkles,
  HelpCircle,
} from "lucide-react";

/**
 * Studio left-rail layout. Groups documents into Editorial, Programmatic,
 * and Configuration so the marketing team finds what they need fast.
 */
export const structure = (S: StructureBuilder) =>
  S.list()
    .title("LIT Marketing")
    .items([
      S.listItem()
        .title("Site settings")
        .icon(Settings)
        .child(S.editor().id("siteSettings").schemaType("siteSettings").documentId("siteSettings")),

      S.divider(),

      S.listItem()
        .title("Editorial")
        .child(
          S.list()
            .title("Editorial")
            .items([
              S.listItem().title("Blog posts").icon(FileText).schemaType("blogPost").child(S.documentTypeList("blogPost").title("Blog posts")),
              S.listItem().title("Glossary").icon(BookOpen).schemaType("glossaryTerm").child(S.documentTypeList("glossaryTerm").title("Glossary")),
              S.listItem().title("Case studies").icon(Trophy).schemaType("caseStudy").child(S.documentTypeList("caseStudy").title("Case studies")),
              S.listItem().title("Customer logos").icon(Building2).schemaType("customerLogo").child(S.documentTypeList("customerLogo").title("Customer logos")),
              S.listItem().title("Testimonials").icon(Quote).schemaType("testimonial").child(S.documentTypeList("testimonial").title("Testimonials")),
              S.listItem().title("Authors").icon(User).schemaType("author").child(S.documentTypeList("author").title("Authors")),
              S.listItem().title("Categories").icon(Folder).schemaType("category").child(S.documentTypeList("category").title("Categories")),
              S.listItem().title("Tags").icon(TagIcon).schemaType("tag").child(S.documentTypeList("tag").title("Tags")),
            ]),
        ),

      S.listItem()
        .title("Platform")
        .child(
          S.list()
            .title("Platform")
            .items([
              S.listItem().title("Features").icon(Sparkles).schemaType("feature").child(S.documentTypeList("feature").title("Features")),
              S.listItem().title("FAQs").icon(HelpCircle).schemaType("faq").child(S.documentTypeList("faq").title("FAQs")),
            ]),
        ),

      S.listItem()
        .title("Programmatic")
        .child(
          S.list()
            .title("Programmatic")
            .items([
              S.listItem().title("Trade lanes").icon(Route).schemaType("tradeLane").child(S.documentTypeList("tradeLane").title("Trade lanes")),
              S.listItem().title("Industries").icon(Layers).schemaType("industry").child(S.documentTypeList("industry").title("Industries")),
              S.listItem().title("Use cases").icon(Target).schemaType("useCase").child(S.documentTypeList("useCase").title("Use cases")),
              S.listItem().title("Comparisons").icon(GitCompare).schemaType("comparison").child(S.documentTypeList("comparison").title("Comparisons")),
              S.listItem().title("Integrations").icon(Plug).schemaType("integration").child(S.documentTypeList("integration").title("Integrations")),
              S.listItem().title("Free tools").icon(Wrench).schemaType("freeTool").child(S.documentTypeList("freeTool").title("Free tools")),
            ]),
        ),

      S.divider(),

      S.listItem().title("Pages (generic)").icon(File).schemaType("page").child(S.documentTypeList("page").title("Pages")),
    ]);
