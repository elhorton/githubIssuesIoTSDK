
//--------------------------- START OF INSPECT ISSUES SCRIPT ------------------------------//

var https = require('https');
const { BlobServiceClient } = require('@azure/storage-blob');

// CONSTANTS
var ONE_HOUR = 60 * 60 * 1000;
var ONE_DAY = ONE_HOUR * 24;
var LAST_7_DAYS = ONE_DAY * 7;
var MAX_STALE_TIME = ONE_DAY * 14;
var MAX_RETURN_ISSUE_COUNT = 50;

// repo names
var repos = [
  { repo: 'azure-iot-sdk-node' },
  { repo: 'azure-iot-sdk-python' },
  { repo: 'azure-iot-sdk-c' },
  { repo: 'azure-iot-sdk-csharp' },
  { repo: 'azure-iot-sdk-java' }
];

//--------------------- CREATE CSV WRITING INFRASTRUCTURE ------------------------------//
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csvWriter = createCsvWriter({
  path: 'githubIssues.csv',
  header: [
    {id: 'date', title: 'Date'},
    {id: 'sdkname', title: 'SDK Name'},
    {id: 'issues', title: 'Issues'},
    {id: 'new', title: 'New Issues'},
    {id: 'stale', title: 'Stale Issues'},
    {id: 'unassigned', title: 'Unassigned Issues'},
    {id: 'enhancements', title: 'Enhancements'},
    {id: 'investigate', title: 'Under Investigation'},  
  ],
  append: true,
});
const recentCsvWriter = createCsvWriter({
  path: 'mostRecentGithubIssues.csv',
  header: [
    {id: 'date', title: 'Date'},
    {id: 'sdkname', title: 'SDK Name'},
    {id: 'issues', title: 'Issues'},
    {id: 'new', title: 'New Issues'},
    {id: 'stale', title: 'Stale Issues'},
    {id: 'unassigned', title: 'Unassigned Issues'},
    {id: 'enhancements', title: 'Enhancements'},
    {id: 'investigate', title: 'Under Investigation'},  
  ],
});

var masterData = [];

//--------------------- Access the Github Repos ------------------------------//

// define the promise
function github_request(repo_path) {
  return new Promise((resolve, reject) => {
    let chunk_body = '';
    let gh_auth_token = process.env.GITHUB_AUTH_TOKEN;
    if (typeof(gh_auth_token) == 'undefined') {
      gh_auth_token = '';
    }

    https.get({
      host: 'api.github.com',
      path: repo_path,
      headers: {
        'User-Agent': 'Azure-IoT-SDK',
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': gh_auth_token  //'token <github_token>'
      }
    }, (response) => {
      // Continuously update stream with data
      response.on('data', (fragments) => {
        chunk_body += fragments;
      });
      response.on('end', () => {
        // Data reception is done, do whatever with it!
        if (response.statusCode > 299) {
          //response.headers['Link']
          console.log('Call failed with status code: ' + response.statusCode);
          reject(response.statusCode);
        }
        else {
          resolve(chunk_body);
        }
      });
      response.on('error', (error) => {
        // promise rejected on error
        console.log('error ' + error);
        reject(error);
      });
    });
  });
}

//--------------------- BUILD UP DATA FOR EACH REPO ------------------------------//
const parse_github_issue = async function (repo_path, issueResult) {
  return new Promise((resolve, reject) => {
    github_request(repo_path).then(result => {
      issues_json = JSON.parse(result);
      var issues_count = issues_json.length;
      // Loop through each issue counting
      for (var index = 0; index < issues_count; index++) {
        var issue = issues_json[index];

        // categorize if the issues are enhancement or investigation
        for (var issueindex = 0; issueindex < issue.labels.length; issueindex++) {
         
          var label = issue.labels[issueindex];
  
          if (label.name == 'enhancement') {
            issueResult.enhancement++;
          } else if (label.name == 'investigation-required') {
            issueResult.underInvestigation++;
          }
        }

        if (typeof(issue.pull_request) == 'undefined') {
          // This is an issue and not a pull request
          issueResult.issueCount++;

          // If the issue is over MAX_STALE_TIME then mark it as stale
          var today_date = new Date();
          var update_date = new Date(issue.updated_at);
          if ((today_date - update_date) > MAX_STALE_TIME) {
            issueResult.staleIssues++;
          }

          var created_date = new Date(issue.created_at);
          if ((today_date - created_date) < LAST_7_DAYS) {
            issueResult.last7Days++;
          }

          if (issue.assignee === null) {
            issueResult.unassigned++;
          }
        }
      }
      resolve(issues_count);
    }).catch(error => {
      console.log(error);
      reject(error);
    });
  });
}

//--------------------- FUNCTION TO COLLECT ALL THE DATA AND WRITE TO MASTER DATA OBJECT ------------------------------//
async function run_issue_collector(repo_name) {
  var issueResult = {
    issueCount: 0,
    last7Days: 0,
    staleIssues: 0,
    unassigned: 0,
    underInvestigation: 0,
    enhancement: 0
  };
  var page_num = 1;
  var path = '';
  let issues_num = 0;

  do {
    path = '/repos/azure/' + repo_name + '/issues?page=' + page_num++ + '&per_page=' + MAX_RETURN_ISSUE_COUNT;
    await parse_github_issue(path, issueResult).then(result => {
      issues_num = result;
    }).catch(error => {
      console.log(error);
    });
  } while(issues_num == MAX_RETURN_ISSUE_COUNT);

  // report Data
  console.log('Repo: ' + repo_name);
  console.log('      Issues: ' + issueResult.issueCount);
  console.log('  New Issues: ' + issueResult.last7Days);
  console.log('Stale Issues: ' + issueResult.staleIssues);
  console.log('  Unassigned: ' + issueResult.unassigned);
  console.log('  Enhancement: ' + issueResult.enhancement);
  console.log('  Investigation: ' + issueResult.underInvestigation);
  console.log('');

  var newdate = new Date().toLocaleDateString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  var repoData = {
    date: newdate,
    sdkname: repo_name,
    issues: issueResult.issueCount,
    new: issueResult.last7Days,
    stale: issueResult.staleIssues,
    unassigned: issueResult.unassigned,
    enhancements: issueResult.enhancement,
    investigate: issueResult.underInvestigation
  }

  masterData.push(repoData);
}

//--------------------- UPLOAD TO BLOB function: uploads two csvs (historic data and recent data) to Azure blob storage acct ------------------------------//
async function uploadToBlob() {
  console.log('Uploading the csv file to Azure blob');
 
  const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const blobServiceClient = await BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);

  // get historic data container
  var containerName = "ghissuescsv";
  const containerClient = await blobServiceClient.getContainerClient(containerName);

  // get recent data container
  var recentContainerName = "newghissuecsv";
  const recentContainerClient = await blobServiceClient.getContainerClient(recentContainerName);

// var ftcontainerName = "functiontest";
// const ftContainerClient = await blobServiceClient.getContainerClient(ftcontainerName);

  // upload the historic data
  var blobName = "githubissues.csv";

  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  //const blockBlobClient = ftContainerClient.getBlockBlobClient(blobName);

  var historicDataPath = "githubIssues.csv"

  try {
      await blockBlobClient.uploadFile(historicDataPath, {
        blockSize: 4 * 1024 * 1024, // 4MB block size
        concurrency: 20, // 20 concurrency
        onProgress: (ev) => console.log(ev)
      });
      console.log("Uploading the file succeeded!");
    } catch (err) {
      console.log(
        `uploadFile failed, requestId - ${err.details.requestId}, statusCode - ${err.statusCode}, errorCode - ${err.details.errorCode}`
      );
    }
  
  // upload the most recent data  
  var blobName = "mostRecentGithubIssues.csv";

  const blockBlobClient2 = recentContainerClient.getBlockBlobClient(blobName);
 // const blockBlobClient2 = ftContainerClient.getBlockBlobClient(blobName);

  var recentDataPath = "mostRecentGithubIssues.csv"

  try {
      await blockBlobClient2.uploadFile(recentDataPath, {
        blockSize: 4 * 1024 * 1024, // 4MB block size
        concurrency: 20, // 20 concurrency
        onProgress: (ev) => console.log(ev)
      });
      console.log("Uploading the file succeeded!");
    } catch (err) {
      console.log(
        `uploadFile failed, requestId - ${err.details.requestId}, statusCode - ${err.statusCode}, errorCode - ${err.details.errorCode}`
      );
    }

}

// ----------------------- Download File: downloads the historic csv file from Azure Storage Blob -----------------------//

async function downloadFile() {
  const ONE_MINUTE = 60 * 1000;
  const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const blobServiceClient = await BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);

  // get historic data container
  var containerName = "ghissuescsv";
  const containerClient = await blobServiceClient.getContainerClient(containerName);

  // download the historic data
var blobName = "githubissues.csv";
const blockBlobClient = containerClient.getBlockBlobClient(blobName);
const aborter = AbortController.timeout(30 * ONE_MINUTE);
const downloadResponse = await blockBlobClient.download(0,aborter);
const downloadedContent = await streamToString(downloadResponse.readableStreamBody);

// console.log("Downloaded content: " + downloadedContent);
// console.log("non stream: " + downloadedContent);
fs = require('fs');
fs.writeFile("githubissues.csv", data, [encoding], [callback])
return downloadedContent;
}

//--------------------- MAIN FUNCTION: Gets Issues, Write CSV files, Uploads to Azure Blob ------------------------------//
async function get_all_issues() {
  for (var repo_index = 0; repo_index < repos.length; repo_index++) {
    await run_issue_collector(repos[repo_index].repo).then(result => {
    }).catch(error => {
      console.log(error);
    });
  }
  try {
  csvWriter
    .writeRecords(masterData)
    .then(()=> console.log('The historic CSV file was written successfully'));
  recentCsvWriter
    .writeRecords(masterData)
    .then(()=> console.log('The recent data CSV file was written successfully'));
  } catch (err) { console.log("could not write the csv files..." + err); }
  
  setTimeout(() => {  uploadToBlob().then(() => console.log('Done')).catch((ex) => console.log(ex.message)); }, 2000); // slight delay to ensure the file is updated before uploading to blob
}

//----------------------- RUN AS AZURE FUNCTION -----------------------------------//

module.exports = async function (context, myTimer) {
    get_all_issues() // RUN THE PROGRAM   
};







