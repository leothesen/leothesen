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
		![](/notion-images/9651edfc9e643587.png)
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