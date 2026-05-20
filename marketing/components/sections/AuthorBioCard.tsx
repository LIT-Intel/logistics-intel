import Image from "next/image";

export type AuthorBio = {
  name: string;
  role?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  socialLinks?: {
    twitter?: string | null;
    linkedin?: string | null;
    website?: string | null;
  } | null;
};

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

/**
 * `AuthorBioCard` — between article body and related links. 160×160
 * portrait left, eyebrow + H3 + role + bio paragraph + social link row
 * right. A cyan→blue→violet 3px top stripe IS used here as a brand
 * accent — this is the one permitted use of cyan on a light-bg surface
 * because it's a decorative stripe, not text.
 */
export function AuthorBioCard({ author }: { author: AuthorBio }) {
  if (!author?.name) return null;
  const social = author.socialLinks;
  return (
    <section className="author-bio">
      <div className="ab-portrait">
        {author.avatarUrl ? (
          <Image
            src={author.avatarUrl}
            alt={author.name}
            width={160}
            height={160}
            loading="lazy"
          />
        ) : (
          <div
            className="font-display flex h-full w-full items-center justify-center text-white"
            style={{
              background:
                "linear-gradient(160deg,#3b82f6 0%,#6366f1 60%,#8b5cf6 100%)",
              fontSize: 48,
              fontWeight: 700,
            }}
            aria-hidden
          >
            {initials(author.name)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="ab-eyebrow">About the author</div>
        <h3>{author.name}</h3>
        {author.role && <div className="ab-role">{author.role}</div>}
        {author.bio && <p className="ab-bio">{author.bio}</p>}
        {social && (
          <div className="ab-social">
            {social.linkedin && (
              <a href={social.linkedin} target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            )}
            {social.twitter && (
              <a href={social.twitter} target="_blank" rel="noopener noreferrer">
                X / Twitter
              </a>
            )}
            {social.website && (
              <a href={social.website} target="_blank" rel="noopener noreferrer">
                Website
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
