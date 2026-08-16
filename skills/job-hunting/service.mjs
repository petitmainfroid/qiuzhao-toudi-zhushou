import { JobDomainError } from '../../modules/job-contracts/index.mjs';

export class JobHuntingAgentService {
  constructor({ workflow } = {}) {
    const methods = [
      'workspaceStatus', 'start', 'submitRanking', 'reviewQueue',
      'recordReview', 'prepareApplication', 'status', 'cancel'
    ];
    if (!workflow || !methods.every((name) => typeof workflow[name] === 'function')) {
      throw new JobDomainError('workflow_unavailable', 'The shared JobWorkflow is unavailable');
    }
    this.workflow = workflow;
  }

  workspaceStatus(input) { return this.workflow.workspaceStatus(input); }
  searchStart(input) { return this.workflow.start(input); }
  rankingSubmit(input) { return this.workflow.submitRanking(input); }
  reviewQueue(input) { return this.workflow.reviewQueue(input); }
  reviewDecide(input) { return this.workflow.recordReview(input); }
  applicationPrepare(input) { return this.workflow.prepareApplication(input); }
  workflowStatus(input) { return this.workflow.status(input); }
  workflowCancel(input) { return this.workflow.cancel(input); }
}
