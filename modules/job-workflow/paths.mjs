import path from 'node:path';
import { jobRepositoryDirectory } from '../job-repository/paths.mjs';

export function jobWorkflowPath(env = process.env) {
  return path.join(jobRepositoryDirectory(env), 'workflows-v1.json');
}
