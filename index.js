const chromium = require("chrome-aws-lambda");
const moment = require("moment");
const {
  createMultipleArticles,
  filterByArticleLinks,
} = require("./db/articles");

const fetchArticles = async (event, context) => {
  const extension = event["extension"];
  const articlesUrl = `https://gameinformer.com/product/${extension}`;
  let browser = null;

  try {
    browser = await chromium.puppeteer.launch({
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(0);

    await Promise.all([
      page.goto(articlesUrl),
      page.waitForSelector("div.views-row"),
      page.waitForNavigation(),
    ]);

    const articles = await page.$$eval("div.views-row", (el) => {
      return el.map((e) => {
        const imageSrc = e.querySelector("div.teaser-left-wrapper picture img").src;
        const title = e.querySelector("div.teaser-right-wrapper h2.page-title").innerText;
        const publicationDate = e.querySelector("div.teaser-right-wrapper span[property='schema:dateCreated']").getAttribute("content");
        const articleLink = e.querySelector("div.teaser-right-wrapper h2.page-title a").href;
        return {imageSrc, title, publicationDate, articleLink};
      });
    });

    const mappedArticles = articles
      .filter((article) => {
        return moment(article.publicationDate, "YYYY-MM-DD").isAfter(
          moment().subtract(30, "days")
        );
      })
      .map((article) => {
        return {
          ...article,
          publicationDate: moment(article.publicationDate, "YYYY-MM-DD")
            .toDate()
            .toISOString(),
        };
      });

    await browser.close();
    const articlesLinks = mappedArticles.map((article) => article.articleLink);
    const currentArticles = await filterByArticleLinks(articlesLinks);
    const newArticles = mappedArticles.filter((article) => {
      return !currentArticles.Items.some(
        (currentArticle) => currentArticle.article_link === article.articleLink
      );
    });

    if (newArticles.length > 0) {
      const result = await createMultipleArticles(newArticles);
      return result;
    } else {
      return { msg: "No articles found" };
    }
  } catch (error) {
    console.log(error);
    await browser?.close();
    return { msg: "Error fetching articles", error };
  }
};

exports.handler = fetchArticles;
