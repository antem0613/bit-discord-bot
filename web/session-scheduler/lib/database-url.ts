export function getDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const required = (name: string) => {
    const value = environment[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };

  const url = new URL("postgresql://localhost");
  url.username = encodeURIComponent(required("POSTGRES_USER"));
  url.password = encodeURIComponent(required("POSTGRES_PASSWORD"));
  url.hostname = environment.POSTGRES_HOST || "localhost";
  url.port = environment.POSTGRES_PORT || "5433";
  url.pathname = `/${encodeURIComponent(required("POSTGRES_DB"))}`;
  url.searchParams.set("schema", "public");
  return url.toString();
}