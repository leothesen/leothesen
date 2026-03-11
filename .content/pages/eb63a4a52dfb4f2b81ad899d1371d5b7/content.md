# Overview
## Problem
I have a busy calendar, yet need to be available for others for help and support. Slack statuses are often used by people to see where I’m at. 
<empty-block/>
Google Calendar has a native integration with Slack to update your status. Yet it didn’t provide much more context than “In a meeting”. I wanted to build something that would provide full transparency into my calendar. 
<empty-block/>
I tried to build something similar using Zapier and Make, yet I found the platforms very limiting in terms of flexibility and often hit the pay wall. So with a little help from the AI friends we came up with this.
## Solution
This Google Apps Script syncs your Slack status with your Google Calendar events. It updates your Slack status based on the type of event you're currently in, the time until your next event, and your inferred working hours. The script runs every minute, ensuring your Slack status remains up-to-date with your calendar and working hours.
## Functionality
The script performs the following actions:
- Fetches events from your Google Calendar.
- Determines the current and next events.
- Updates your Slack status based on the type and timing of events.
- Infers working hours based on busy and free periods in your calendar.
- Prioritises events based on your RSVP status.
<empty-block/>
### Status Table
<table header-row="true">
<colgroup>
<col>
<col>
<col width="322.5208435058594">
</colgroup>
<tr>
<td>Event Type</td>
<td>Icon</td>
<td>Status Text</td>
</tr>
<tr>
<td>Meeting with attendees</td>
<td>📞</td>
<td>meeting: \<event title\></td>
</tr>
<tr>
<td>Focus time meeting</td>
<td>🎧</td>
<td>focus time: \<event title\></td>
</tr>
<tr>
<td>Meeting without attendees</td>
<td>💻</td>
<td>working on: \<event title\></td>
</tr>
<tr>
<td>Out of office</td>
<td>🚫</td>
<td>out of office: \<event title\></td>
</tr>
<tr>
<td>No current meeting within working hours</td>
<td>🟢</td>
<td>available for X minutes/hours</td>
</tr>
<tr>
<td>No upcoming meeting</td>
<td>🟢</td>
<td>available</td>
</tr>
<tr>
<td>Outside of working hours</td>
<td>🔴</td>
<td>unavailable</td>
</tr>
</table>
# Step-by-Step Guide
## Step 1: Set Up Your Slack API
1. **Create a Slack App**:
	- Go to the Slack API.
	- Click on "Create an App" and choose "From scratch".
	- Name your app and select your Slack workspace.
2. **Add OAuth Scopes**:
	- In your Slack app settings, go to "OAuth & Permissions".
	- Under "User Token Scopes", add the following scopes:
		- `users.profile:write`
		- `users:read`
	- **Note**: Ensure these are user token scopes, not bot token scopes.
3. **Install the App to Your Workspace**:
	- In the "OAuth & Permissions" section, click "Install App to Workspace".
	- Authorize the app to access your workspace.
	- After installation, copy the "OAuth Access Token" (user token, prefixed with `xoxp`, not the bot token). Save this somewhere - as you will need to paste it into the code.
4. **Retrieve Your Slack User ID**:
	- Open Slack and click on your profile picture in the top right corner.
	- Click on "Profile".
	- In the profile view, click on the three dots (More Actions) and select "Copy member ID". Save this somewhere - as you will need to paste it into the code.
## Step 2: Set Up Google Apps Script
1. **Create a New Google Apps Script**:
	- Go to [Google Apps Script](https://script.google.com/).
	- Click on `+ New Project`.
2. **Enable Advanced Google Services**:
	- Under the code editor click on `Services` \> `Advanced Google services` , ensure that `V3` is selected.
	- Add the Google Calendar API.
3. **Write the Script**:
	- Copy and paste the following script into the code editor:
```javascript
function updateSlackStatus() {
  var calendarId = 'primary'; // Use your calendar ID if different
  var now = new Date();
  var endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  // Fetch working hours from busy/free times
  var workingHours = getWorkingHours(calendarId, now);

  var isWorkingHours = now.getHours() >= workingHours.start && now.getHours() < workingHours.end;

  var events = Calendar.Events.list(calendarId, {
    timeMin: now.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  }).items;

  var currentEvent = getCurrentEvent(events, now);
  var nextEvent = events.find(event => {
    var startTime = new Date(event.start.dateTime || event.start.date);
    return !event.start.date && startTime > now; // Find the next non all-day event
  });

  var slackToken = 'YOUR_USER_SLACK_TOKEN'; // Replace with your Slack token
  var slackUser = 'YOUR_SLACK_USER_ID'; // Replace with your Slack user ID
  var statusText = '';
  var statusEmoji = '';
  var expirationTime;

  if (currentEvent) {
    var eventTitle = currentEvent.summary;

    if (currentEvent.eventType === 'outOfOffice') {
      statusEmoji = '🚫';
      statusText = 'out of office: ' + eventTitle;
    } else if (currentEvent.eventType === 'focusTime') {
      statusEmoji = '🎧';
      statusText = 'focus time: ' + eventTitle;
    } else if (currentEvent.attendees && currentEvent.attendees.length > 0) {
      statusEmoji = '📞';
      statusText = 'meeting: ' + eventTitle;
    } else {
      statusEmoji = '💻';
      statusText = 'working on: ' + eventTitle;
    }

    expirationTime = Math.floor(new Date(currentEvent.end.dateTime || currentEvent.end.date).getTime() / 1000);
  } else if (!isWorkingHours) {
    statusEmoji = '🔴';
    statusText = 'unavailable';
    expirationTime = Math.floor(endOfDay.getTime() / 1000);
  } else {
    statusEmoji = '🟢';
    if (nextEvent) {
      var nextMeetingStart = new Date(nextEvent.start.dateTime || nextEvent.start.date);
      var minutesUntilNextMeeting = Math.round((nextMeetingStart - now) / 60000); // Convert milliseconds to minutes

      if (minutesUntilNextMeeting > 60) {
        var hoursUntilNextMeeting = Math.floor(minutesUntilNextMeeting / 60);
        var remainingMinutes = minutesUntilNextMeeting % 60;
        var halfHours = remainingMinutes >= 30 ? 0.5 : 0;
        var totalHours = hoursUntilNextMeeting + halfHours;
        statusText = 'available for ' + totalHours + ' hours';
      } else {
        statusText = 'available for ' + minutesUntilNextMeeting + ' minutes';
      }

      expirationTime = Math.floor(nextMeetingStart.getTime() / 1000);
    } else {
      statusText = 'available';
      expirationTime = Math.floor(endOfDay.getTime() / 1000);
    }
  }

  var payload = {
    "profile": {
      "status_text": statusText,
      "status_emoji": statusEmoji,
      "status_expiration": expirationTime
    }
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": "Bearer " + slackToken
    },
    "payload": JSON.stringify(payload)
  };

  try {
    var response = UrlFetchApp.fetch('https://slack.com/api/users.profile.set', options);
    Logger.log('Response: ' + response.getContentText()); // Log the response from Slack
  } catch (e) {
    Logger.log('Error: ' + e.message);
  }
}

function getWorkingHours(calendarId, date) {
  var startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  var endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

  var freeBusy = Calendar.Freebusy.query({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    items: [{ id: calendarId }]
  });

  var busyPeriods = freeBusy.calendars[calendarId].busy;
  var workingHours = { start: 9, end: 17 }; // Default values

  if (busyPeriods.length > 0) {
    var firstBusyPeriod = new Date(busyPeriods[0].start);
    var lastBusyPeriod = new Date(busyPeriods[busyPeriods.length - 1].end);

    workingHours.start = firstBusyPeriod.getHours();
    workingHours.end = lastBusyPeriod.getHours();
  }

  return workingHours;
}

function getCurrentEvent(events, now) {
  var yesEvents = [];
  var noEvents = [];
  var noResponseEvents = [];

  events.forEach(event => {
    var startTime = new Date(event.start.dateTime || event.start.date);
    var endTime = new Date(event.end.dateTime || event.end.date);

    if (!event.start.date && startTime <= now && endTime >= now) {
      if (event.attendees) {
        var myResponse = event.attendees.find(attendee => attendee.self).responseStatus;
        if (myResponse === 'accepted') {
          yesEvents.push(event);
        } else if (myResponse === 'declined') {
          noEvents.push(event);
        } else {
          noResponseEvents.push(event);
        }
      } else {
        yesEvents.push(event); // Push to yesEvents if there are no attendees
      }
    }
  });

  if (yesEvents.length > 0) {
    return yesEvents[0];
  } else if (noResponseEvents.length > 0) {
    return noResponseEvents[0];
  } else {
    return null;
  }
}

function scheduleTrigger() {
  ScriptApp.newTrigger('updateSlackStatus')
    .timeBased()
    .everyMinutes(1)
    .create();
}

```
<empty-block/>
	- Update the `YOUR_USER_SLACK_TOKEN` and `YOUR_SLACK_USER_ID` with the values you copied earlier. 
<empty-block/>
1. **Set Up Triggers**:
	- Click on the clock icon on the left sidebar (Triggers).
	- Click on `+ Add Trigger` in the bottom right corner.
	- Set up the trigger as follows:
		- Choose which function to run: `updateSlackStatus`
		- Choose which deployment should run: `Head`
		- Select event source: `Time-driven`
		- Select type of time-based trigger: `Minutes timer`
		- Select minute interval: `Every minute`
	- Click `Save`.
2. **Authorise the Script**:
	- The first time you run the script, you will need to authorize it to access your Google Calendar and make requests to Slack.
	- Run the `updateSlackStatus` function by clicking on the play button icon in the script editor.
	- Follow the prompts to grant the necessary permissions.
<empty-block/>
# Conclusion
By following these steps, you will have a Google Apps Script that automatically updates your Slack status based on your Google Calendar events.
<empty-block/>
Please reach out if you have any issues or suggestions 🙏