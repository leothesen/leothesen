So I was writing some Python for the first time in a few years, and wasn’t filled with confidence that I was producing code of sufficient quality. ChatGPT to the rescue.
<empty-block/>
I'm not going to go into the details about the work too much, but basically I had to create a validation class that would iterate through all the rows in the current bill of materials (BoM) and perform ask the AI to make sure that the variant commodity links make sense (eg: that the steering wheel isn't part of the window grouping).
# 👩‍💻 Rough workflow:
- Create basic file and structure
- Commit 📥
- Add dummy call to the database to check that I could create an issue
- Commit 📥
- Get the current BoM and create a loop to go through each row
- Commit 📥
- Create a prompt template and send the current row to ChatGPT to validate the commodity links
- Commit 📥
- Tie up all the pieces by getting ChatGPT to return an expected Python dictionary, and save that issue to the database with a suggestion from the AI
- Commit 📥
- **This was the important step**. I was basically done at this point. But my code looked like it was written by someone who hadn't written Python code in two years 👀. I made a request to ChatGPT (using GPT4) and it honestly did a refactor better than anything that I could have imagined. The functionality was unchanged, but the structure, documentation, organisation and modularity of the class was - if I say so myself - pretty superb.
<empty-block/>
The prompt I used was:
```markdown
I have the following python file:
```py
# Insert the whole Python file here
```

You are an expert software developer specilising in Python. 
Please refector and cleanup the Python file above ensuring that you do the following:
- Make the code more professional
- Make the code more modular
- Make variable and function names more descriptive
- Ensure that the code is human readable 
```
The result was amazing ⭐
<empty-block/>
- Commit 📥
- Create a PR 💌
- Enjoy the lack of doubt that I now have in my life, knowing that I can say that I’m a professional Python engineer once again (well, kind of) 🥲
<empty-block/>
# 🥡 Takeaways
Commit often, every time that you've added value to the codebase and have a working application. It's basically a snapshot in time of a working version of the application. Think of it as a "save game" that you can fall back to if you make a mistake and lose against the boss.
<br>It takes five minutes to get an omniscient AI to perform a refactor, clean up and even add performance improvements to your code that make you look like a veteran of the industry. You performed the hard part, solving the problem; use the tools at your disposal to do the time consuming pieces.