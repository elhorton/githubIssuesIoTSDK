# Github Issues Dashboard Flow

This is a project to automatically fetch all issues from each of the Azure IoT SDK repos. It automatically updates daily, and publishes the dashboard in the IoT Developers & Devices PowerBI group. The [dashboard is located here](https://msit.powerbi.com/groups/471ee79d-e373-4f62-ae58-9e3944580d35/reports/1e3d8bf0-c07e-42d7-962b-7e74caba3877?ctid=72f988bf-86f1-41af-91ab-2d7cd011db47).

This document will walk through the project's individual components and provide guidance on how to make changes in the future. 

## Workflow

![ghIssueFlowDiagram](ghissuesflow.png)

### Components
This project is made up of several components:
- Azure function automated Node.js script
- Azure Blob storage account containing csv files outputted from the Azure Function script
- Microsoft Power Flow which automatically updates the Power BI dashboard when an update is made to the blob storage account
- PowerBI dashboard that ingests the .csv files from the Azure Blob storage account to display visual displays

#### Azure Function Node.js script
The code in this repo is almost all related solely to the Azure Function Node.js script. The main script, `index.js`, is contained in the `TimerTriggerGhIssues` folder. It is programmed to run daily, currently at 1 am PST each night. See the `TimerTriggerGhIssues` for how to adjust the timing. 

The script is fairly simple-- it uses the Github Developers REST API to return all the issues from each repo. It then parses the response to create a dictionary object for each repo counting the number of:
- **Total issues**:  A count of all currently open issues in the repo
- **New issues**: created in the last 7 days
- **Stale issues**: has not been updated in the last 14 days
- **Unassigned issues**: Has not been assigned to an owner for triaging
- **Enhancments**: issues with an `enhancement` label, this indicates that the feature team has marked it as a possible enhancement in the backlog
- **Under Investigation**: issues with an `investigation-required` tag, this indicates that the feature team needs to further investigate and it is on the backlog. 

**Output:**
The script makes use of the `csv-writer` module to generate two unique .csv files. 

1) `githubissues.csv` contains the historic data from every run of this script. It is not smart-- all it does is append rather than overwrite. So it will append to the current `githubissues.csv` in the project repo. If that file does not exist, it will generate a new one, but the .csv headers will be missing.
2) `recentgithubissues.csv` is overwritten each time the script runs, and contains only the data from the most recent run. This is useful for separating data in the PowerBI dashboard to show current stats vs. historic data trends.

Both of these files are uploaded to the Azure Blob Storage account upon generation, which leads us to the next component. 

The function app currently lives in the IoT Developer and Devices team's `aziotclb` Azure subscription. You can deploy a function app easily from VS Code by installing the `Azure Functions` extension and selecting `Azure Functions: Deploy  to Function App` from the options. 

***Note***: When deploying for the first time, VS Code automatically deploys the app's code as a package in Azure. This unfortunately means that the app does not have write access to the Azure filesystem (important for the .csv files). To fix this, go to the Function App's settings within Azure portal, and delete the `RUN_FROM_PACKAGE` or similar-sounding setting, then re-deploy. 

***Note***: When running this script, you will need to set up the environment variable for the storage account's connection string. 

#### Azure Blob Storage account

This is pretty straightforward, it's just an Azure Blob storage account with two containers, `ghissuescsv` and `newghissuecsv`, for each .csv file mentioned above. The account resides in the internal `aziotclb` subscription. 

#### Microsoft Power Flow
This is a very simple automation flow hosted by Microsoft Power Apps and registered to the IoT Developers & Devices service group. It only has two steps:
1) When there is a change to the `ghissuescsv` container,
2) Refresh the PowerBI dashboard

Anyone in the IoT D&D group should have access to the flow [here](https://preview.flow.microsoft.com/manage/environments/839eace6-59ab-4243-97ec-a5b8fcc104e4/flows/shared/01bbb4c7-41bd-454a-8f34-b8f4d3186beb/details).


#### PowerBI dashboard
The dashboard is hosted in the IoT Developers & Devices workspace within PowerBI. It can be edited within the web browser or by opening it in the PowerBI desktop app. It ingests data from the Azure Blob Storage account.

***Note***: if starting from scratch with a new data set, you will need to set permissions within PowerBI to access the Azure Blob Storage account. This can be done on the `Settings` page under `Data Source Credentials`, where you must provide the account's primary access key. ![dashboardSettings](dashboardSettings.png)


## How to update

### Set up local workspace
- [Details here](https://docs.microsoft.com/en-us/azure/azure-functions/functions-develop-local) for setting up VS Code for use with Azure Functions.
- Clone this repo
- Ensure you have access to the `aziotclb` subscription and are familiar with the Blob storage account and current Function App resources
- **IMPORTANT**: Copy the current `ghissuescsv` file from the Azure Storage blob into your local repo. This ensures you have all of the historic data and you don't overwrite the file by starting from scratch. 

### Update the script
- Set up the local workspace
- Test changes to the script locally using the `Azure Functions` extension
- Redeploy the Function App in the same location-- this will keep the rest of the flow the same. If you change where the files are loaded (different Storage account), then you will have to update the Power Automation flow as well. 

### Update the timing
- See the `TimerTriggerGhIssues` folder.

### Update the flow
Self-explanatory to do, see the flow [here](https://preview.flow.microsoft.com/manage/environments/839eace6-59ab-4243-97ec-a5b8fcc104e4/flows/shared/01bbb4c7-41bd-454a-8f34-b8f4d3186beb/details). You just have to make sure the first step is pointing to the right Azure Blob storage account and container and that the second step is pointing at the right PowerBI dashboard (already configured to ingest data from the storage account).

### Update the Power BI dashboard
If you just want to edit visuals of the dashboard and not the data it ingests, then you can make edits on PowerBI's web or desktop app and nothing else will be disrupted. 

If you have changed the data source location, then you must reconfigure the data that the report ingests. This is easiest to do in the PowerBI desktop app. On the home screen, select `Get Data --> More... --> Azure --> Azure Blob Storage`. From there you can navigate to the correct subscription, account, and container. 

***Note***: when importing csv files from Azure Storage blobs, they are unexpanded binary files by default. Select `Transform Data` when uploading, then double click on the only row shown (the file name). This should expand the rows. Apply this change to properly import the data. 

## Future improvements
1) Add tracking of additional labels to keep tabs on the 3 main customer feedback options:
    - `question`
    - `enhancement`
    - `bug`
2) Add a measure for time to first response
3) Adapt for when we move to Track 2 SDK repos
