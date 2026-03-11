# Introduction
::: callout {icon="💡" color="green_bg"}
I took three months off work in 2022, and I decided to write a blog about my experience. I owned the domain [leothesen.com](http://leothesen.com) and began shopping around for a way to build and host a website
:::
<columns>
	<column>
		This is what the blog became:
	</column>
	<column>
		<unknown url="https://www.notion.so/b70eb50f9abe4f1a8b87d21cecd58cd4#ee47285e9b5c46cb845b6fe9e5625d0e" alt="alias"/>
	</column>
</columns>
<empty-block/>
The only requirements that I had for this website were:
- It shouldn’t cost me any money, only a little bit of time
- It should use Notion as a CMS (I’m truly obsessed with Notion)
<empty-block/>
After fishing around for a while I found `nextjs-notion-starter-kit`, which just ticked all the boxes ✅  
<unknown url="https://www.notion.so/b70eb50f9abe4f1a8b87d21cecd58cd4#a00d5d063b264c53a809de9c36e593d8" alt="external_object_instance"/>
<empty-block/>
Firstly it used Next.js, which I am just such a huge fan of as a fullstack framework. And don’t get me started on Vercel’s product offering - it’s absurdly good.
# How does it work?
::: callout {icon="🥜" color="yellow_bg"}
**In a nutshell**<br><br>Vercel hosts the Next.js application for free (on the Hobby tier). I’ve attached the domain [leothesen.com](http://leothesen.com) - which is owned through AWS Route 53 - to Vercel to allow for it to be accessible on the public internet. <br><br>The Next.js application looks through the whole Notion page and all nested subpages and renders those into a site map. 
:::
<empty-block/>
Feel free to look around the [repository](https://github.com/leothesen/leothesen):
<unknown url="https://www.notion.so/b70eb50f9abe4f1a8b87d21cecd58cd4#94c7503f8d47463d8754a2d8a57630d1" alt="external_object_instance"/>
<empty-block/>
## Pages
Each [page](https://github.com/leothesen/leothesen/blob/main/pages/%5BpageId%5D.tsx) within the website - such as this one - is using ISR. 
<unknown url="https://www.notion.so/b70eb50f9abe4f1a8b87d21cecd58cd4#db1910c276bb46869f11441c35c83718" alt="bookmark"/>
<empty-block/>
This means that pages are statically generated at build time, but are able to be updated without rebuilding the whole website if the content on the Notion page changes. 
## APIs
### api/search-notion
AKA the search button in the top right. It is simply a RESTful API served by Next.js that proxied the request through to the Notion API. 
<empty-block/>
### api/social-image
This is a great one. It is used to generate the Open Graph images (like the thumbnails that you see expanding when a link is posted on Whatsapp/Facebook/LinkedIn). 
<empty-block/>
<columns>
	<column>
		For example, the NotionID for this page is `b70eb50f9abe4f1a8b87d21cecd58cd4` . The OG image will be set to [leothesen.com/api/social-image?id=b70eb50f9abe4f1a8b87d21cecd58cd4](http://leothesen.com/api/social-image?id=b70eb50f9abe4f1a8b87d21cecd58cd4), which will result in the following image being returned. It renders the name of the page and the cover photo.
	</column>
	<column>
		![](https://prod-files-secure.s3.us-west-2.amazonaws.com/73e53cee-8b68-4be6-bc8f-db27b855c96e/55e66cfe-0f67-462e-a6d3-66fc9e2220e5/Untitled.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAZI2LB46657EQ2FKN%2F20260311%2Fus-west-2%2Fs3%2Faws4_request&X-Amz-Date=20260311T141216Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEJX%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLXdlc3QtMiJIMEYCIQCT4LuIY2OkzpLsTSXWrLpm9z3%2BcoQ4q6dGU791p6pyygIhAIfdoSJwnGk5oxpEKWz%2B7Hi%2FS9ORSynzXLYZPv9WU3AxKv8DCF4QABoMNjM3NDIzMTgzODA1IgxQ8C6B7p%2FWSZJ8dtgq3APu%2BwRib8FgYFfh6e%2FM1R%2BRG1PTWGaxlyUroefI172v%2FcHpgpRbzmh7VvabJONCdad9v1xh3JA7hBx2NUYMpyPFEVp0aTKki%2FBYcnIWj6ADWJoCIhVz3mgpQVL8GKx1i4Vs3dJZC%2BMeU98%2BHvUA%2BodAbnNjNykNMVe23B0yngZ8G6B3aM80anxlTPe9zDctkN4rKaq5WWDQOvv9CN5zB3A7r8tUMIXKQHMbzxHcS0t%2B%2BfSHzrscq6Bak7LmaI7wEJGt6w%2BiwpCDpjiss%2FywBVGiHW6IwbiiLH86MLRYHhBM6YlaOMha6wnAMCEJHWjkB0AHmcNWolBg1aPnXdGtjDq0%2BZJWgX%2BWWu4%2FwdNV%2BplyfgCFyae8wfDYog3xEkWAopqDGyEWkVqIcZZnXSXr5XiOIUhkq4mlj6ARttf7626WX7tW3x46QqjSnRJvfITIa9LHM%2Bpl3T4dAz0I5uVeYO7KTE74itxw7nb%2F3LKP5Msyjpzarq2%2FULt6M0vmk%2B1rBGr8rzAkAoOrrj0VyeCsE70UEtOuavGrwUtiY7k7WLCHPWLurQt6lm0newJL74y98pgWleiKjmW4qh%2FReeTyN%2BzCnHjCe1FaG0kGqjgLjbzeFc9C%2F7pB9T52JwEESjDN0MXNBjqkAdp%2BYYftUEBWyhzLzNLzaLa6UOECi8tuRqlbcwiJac348yXWg0woPTqgLdPOL1QA0nZN0fZwRCf%2BoRgEoh%2BuolPkPtuqdWmKBRafpl46qGO7bnib8uPddW2c3I0NK%2B1Wv1GepbrYKCWQ%2BjTq3g%2Fsv9BgfZX90o7rkWsJOpFr1eciavWMJJ374MiTsrAWKUestGGD20Q0APnVLNLINYNeN8g1tqw%2B&X-Amz-Signature=f47954860af5057ca3861ed076989a4b7b8a3b551f4546a9949ac982e70d3983&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject)
	</column>
</columns>
<empty-block/>
# Monitoring
Maybe this was vanity, but I was interested to see who was actually looking at the website. I used [Posthog](https://posthog.com/) to extract metrics from usage of the website. It’s not Facebook level traffic, but always interesting to see who pops in:
<unknown url="https://www.notion.so/b70eb50f9abe4f1a8b87d21cecd58cd4#80359745a0c74084bb6b346a699b6d4c" alt="embed"/>
<empty-block/>
# Issues
I found that some of the images would break, and the fix would be that I needed to rebuild the application. I think that it had to do with the URL that Notion returns for the image hosted in S3 expiring. I solved this by setting up a cron job to rebuild the site every morning, it isn’t an ideal solution but it keeps things fresh. 
<empty-block/>
<empty-block/>