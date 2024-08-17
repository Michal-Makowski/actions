const core = require("@actions/core");
const github = require("@actions/github");

async function waitBeforeStart(minWaitBeforeStartTime, maxWaitBeforeStartTime) {
	const waitTime =
		Math.floor(
			Math.random() * (maxWaitBeforeStartTime - minWaitBeforeStartTime + 1)
		) + minWaitBeforeStartTime;
	console.log(
		`\u001b[34m[Job Queue Action]\u001b[32m 🕒 Waiting before send first request`
	);
	await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
}

async function waitRandomTime(minWaitTime, maxWaitTime, queueJobs) {
	const waitTime =
		Math.floor(Math.random() * (maxWaitTime - minWaitTime + 1)) + minWaitTime;
	console.log(
		`\u001b[34m[Job Queue Action]\u001b[32m 🕒 Job with names \u001b[0m${queueJobs.join(
			", "
		)} \u001b[32mis still running. Waiting for ${waitTime} seconds...`
	);
	console.log(" ");
	await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
}

async function run() {
	try {
		const queueJobsInput = core.getInput("queue-jobs");
		const queueJobs = queueJobsInput.split(";").map(job => job.trim());
		const minWaitTime = parseInt(core.getInput("min-wait-time")) || 15;
		const maxWaitTime = parseInt(core.getInput("max-wait-time")) || 30;
		const minWaitBeforeStartTime =
			parseInt(core.getInput("min-wait-before-start-time")) || 15;
		const maxWaitBeforeStartTime =
			parseInt(core.getInput("max-wait-before-start-time")) || 30;
		const token = core.getInput("github-token") || process.env.GITHUB_TOKEN;

		// Validate inputs
		if (isNaN(minWaitTime) || minWaitTime <= 0) {
			console.error(
				"::error title=🕒 Job Queue Action::min-wait-time must be a positive integer"
			);
			process.exit(1);
		}
		if (isNaN(maxWaitTime) || maxWaitTime <= 0 || maxWaitTime < minWaitTime) {
			console.error(
				"::error title=🕒 Job Queue Action::max-wait-time must be a positive integer and greater than or equal to min-wait-time"
			);
			process.exit(1);
		}
		if (isNaN(minWaitBeforeStartTime) || minWaitBeforeStartTime <= 0) {
			console.error(
				"::error title=🕒 Job Queue Action::min-wait-before-start-time must be a positive integer"
			);
			process.exit(1);
		}
		if (
			isNaN(maxWaitBeforeStartTime) ||
			maxWaitBeforeStartTime <= 0 ||
			maxWaitBeforeStartTime < minWaitBeforeStartTime
		) {
			console.error(
				"::error title=🕒 Job Queue Action::max-wait-before-start-time must be a positive integer and greater than or equal to min-wait-before-start-time"
			);
			process.exit(1);
		}
		if (!token) {
			console.error(
				"::error title=🕒 Job Queue Action::github-token input is required"
			);
			process.exit(1);
		}

		// Wait for a random time before starting the action
		await waitBeforeStart(minWaitBeforeStartTime, maxWaitBeforeStartTime);

		const octokit = github.getOctokit(token);
		const { owner, repo } = github.context.repo;

		while (true) {
			try {
				// Fetch workflow runs with status 'queued'
				const { data: queuedWorkflows } =
					await octokit.rest.actions.listWorkflowRunsForRepo({
						owner,
						repo,
						status: "queued",
					});
				console.log(
					`\u001b[34m[Job Queue Action]\u001b[32m 🕒 Retrieved queued \u001b[0m${queuedWorkflows.workflow_runs.length} \u001b[32mworkflow runs`
				);

				// Fetch workflow runs with status 'in_progress'
				const { data: inProgressWorkflows } =
					await octokit.rest.actions.listWorkflowRunsForRepo({
						owner,
						repo,
						status: "in_progress",
					});
				console.log(
					`\u001b[34m[Job Queue Action]\u001b[32m 🕒 Retrieved in_progras \u001b[0m${inProgressWorkflows.workflow_runs.length} \u001b[32mworkflow runs`
				);

				// Combine the results
				const workflows = [
					...queuedWorkflows.workflow_runs,
					...inProgressWorkflows.workflow_runs,
				];

				console.log(
					`\u001b[34m[Job Queue Action]\u001b[32m 🕒 Retrieved a total of \u001b[0m${workflows.length} \u001b[32mworkflow runs`
				);
				// Check if any specified jobs are still running
				const isJobRunning = await Promise.all(
					workflows.map(async workflow => {
						try {
							const { data: jobs } =
								await octokit.rest.actions.listJobsForWorkflowRun({
									owner,
									repo,
									run_id: workflow.id,
								});

							console.log(`\u001b[34m[Job Queue Action]\u001b[32m 🕒`);
							console.log(
								`\u001b[34m[Job Queue Action]\u001b[32m 🕒 Workflow \u001b[0m${workflow.name} #${workflow.run_number} \u001b[32mhas \u001b[0m${jobs.jobs.length} \u001b[32mjobs`
							);

							jobs.jobs.some(job => {
								console.log(
									`\u001b[34m[Job Queue Action]\u001b[32m 🕒 Job Name: \u001b[0m${job.name} `
								);
								console.log(
									`\u001b[34m[Job Queue Action]\u001b[32m 🕒 Job Status: \u001b[0m${job.status} `
								);
							});

							return jobs.jobs.some(job => {
								return (
									queueJobs.includes(job.name) && job.status !== "completed"
								);
							});
						} catch (error) {
							console.error(
								`::error title=🕒 Job Queue Action::Error by fetching job data for workflow ${workflow.id}: ${error.message}`
							);
							process.exit(1);
							return false;
						}
					})
				);

				// Exit the loop if no monitored jobs are running
				if (!isJobRunning.includes(true)) {
					break;
				}

				await waitRandomTime(minWaitTime, maxWaitTime, queueJobs);
			} catch (error) {
				console.error(
					`::error title=🕒 Job Queue Action::Error byChecking running workflows: ${error.message}`
				);
				process.exit(1);
			}
		}

		console.log(
			`\u001b[34m[Job Queue Action]\u001b[32m 🕒 No job with names \u001b[0m${queueJobs.join(
				", "
			)} \u001b[32mis running. Proceeding with the deployment.`
		);
		core.setOutput("status", "ready");
	} catch (error) {
		console.error(
			`::error title=🕒 Job Queue Action::Action failed with error: ${error.message}`
		);
		process.exit(1);
	}
}

run();
