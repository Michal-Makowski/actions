const core = require("@actions/core");
const github = require("@actions/github");

async function waitRandomTime(minWaitTime, maxWaitTime, queueJobs) {
	const waitTime =
		Math.floor(Math.random() * (maxWaitTime - minWaitTime + 1)) + minWaitTime;
	console.log(
		`Job with keys ${queueJobs.join(
			", "
		)} is still running. Waiting for ${waitTime} seconds...`
	);
	await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
}

async function run() {
	try {
		const queueJobsInput = core.getInput("queue-jobs");
		const queueJobs = queueJobsInput.split(",").map(job => job.trim());
		const minWaitTime = parseInt(core.getInput("min-wait-time")) || 30;
		const maxWaitTime = parseInt(core.getInput("max-wait-time")) || 60;
		const token = core.getInput("github-token") || process.env.GITHUB_TOKEN;

		if (isNaN(minWaitTime) || minWaitTime <= 0) {
			throw new Error("min-wait-time must be a positive integer");
		}
		if (isNaN(maxWaitTime) || maxWaitTime <= 0 || maxWaitTime < minWaitTime) {
			throw new Error(
				"max-wait-time must be a positive integer and greater than or equal to min-wait-time"
			);
		}
		if (!token) {
			throw new Error("github-token input is required");
		}

		const octokit = github.getOctokit(token);
		const { owner, repo } = github.context.repo;

		while (true) {
			try {
				const { data: workflows } =
					await octokit.rest.actions.listWorkflowRunsForRepo({
						owner,
						repo,
						status: "in_progress",
					});

				const isJobRunning = await Promise.all(
					workflows.workflow_runs.map(async workflow => {
						try {
							const { data: jobs } =
								await octokit.rest.actions.listJobsForWorkflowRun({
									owner,
									repo,
									run_id: workflow.id,
								});
							return jobs.jobs.some(
								job =>
									queueJobs.includes(job.name) && job.status === "in_progress"
							);
						} catch (error) {
							console.error(
								`Error fetching job data for workflow ${workflow.id}: ${error.message}`
							);
							return false;
						}
					})
				);

				if (!isJobRunning.includes(true)) {
					break;
				}

				await waitRandomTime(minWaitTime, maxWaitTime, queueJobs);
			} catch (error) {
				console.error(`Error checking running workflows: ${error.message}`);
			}
		}

		console.log(
			`No job with keys ${queueJobs.join(
				", "
			)} is running. Proceeding with the deployment.`
		);
		core.setOutput("status", "ready");
	} catch (error) {
		core.setFailed(`Action failed with error: ${error.message}`);
	}
}

run();
