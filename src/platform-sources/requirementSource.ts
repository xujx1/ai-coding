import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SourcedRequirement {
  id: string;
  name: string;
  updatedAt: string;
  paths: string[];
  root?: string;
}

/** Requirement input source. Production callers must inject this explicitly. */
export interface RequirementSource {
  list(): SourcedRequirement[];
  read(requirementId: string, relativePath: string): string | undefined;
  availability(): { available: boolean; reason?: string };
}

export class InMemoryRequirementSource implements RequirementSource {
  constructor(private readonly requirements: ReadonlyArray<SourcedRequirement & { files?: Record<string, string> }> = []) {}
  list(): SourcedRequirement[] { return this.requirements.map(({ files: _files, ...requirement }) => ({ ...requirement, paths: [...requirement.paths] })); }
  read(requirementId: string, relativePath: string): string | undefined { return this.requirements.find(requirement => requirement.id === requirementId)?.files?.[relativePath]; }
  availability(): { available: boolean } { return { available: true }; }
}

/** Adapter boundary for database/object-backed requirement records. */
export class DatabaseRequirementSource implements RequirementSource {
  constructor(
    private readonly load: () => SourcedRequirement[],
    private readonly readFile: (requirementId: string, relativePath: string) => string | undefined,
  ) {}
  list(): SourcedRequirement[] { return this.load().map(requirement => ({ ...requirement, paths: [...requirement.paths] })); }
  read(requirementId: string, relativePath: string): string | undefined { return this.readFile(requirementId, relativePath); }
  availability(): { available: boolean } { return { available: true }; }
}

export class DirectoryRequirementSource implements RequirementSource {
  constructor(private readonly root: string) {}

  list(): SourcedRequirement[] {
    if (!this.availability().available) return [];
    return fs.readdirSync(this.root, { withFileTypes: true })
      .filter(entry => entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name))
      .map(entry => {
        const file = path.join(this.root, entry.name);
        const text = fs.readFileSync(file, 'utf8');
        return { id: entry.name.replace(/\.[^.]+$/, ''), name: markdownTitle(text) ?? entry.name.replace(/\.[^.]+$/, ''), updatedAt: fs.statSync(file).mtime.toISOString(), paths: [entry.name], root: this.root };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  read(requirementId: string, relativePath: string): string | undefined {
    if (!this.list().some(requirement => requirement.id === requirementId) || !safeRelative(relativePath)) return undefined;
    const candidate = path.resolve(this.root, relativePath);
    if (!candidate.startsWith(`${path.resolve(this.root)}${path.sep}`) || !fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return undefined;
    return fs.readFileSync(candidate, 'utf8');
  }

  availability(): { available: boolean; reason?: string } {
    return fs.existsSync(this.root) && fs.statSync(this.root).isDirectory() ? { available: true } : { available: false, reason: `Requirement directory is unavailable: ${this.root}` };
  }
}

export class UnavailableRequirementSource implements RequirementSource {
  constructor(private readonly reason: string) {}
  list(): SourcedRequirement[] { return []; }
  read(_requirementId: string, _relativePath: string): string | undefined { return undefined; }
  availability(): { available: false; reason: string } { return { available: false, reason: this.reason }; }
}

function markdownTitle(text: string): string | undefined { return text.split(/\r?\n/).find(line => line.startsWith('# '))?.slice(2).trim() || undefined; }
function safeRelative(value: string): boolean { return value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes('..'); }
