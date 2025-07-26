from locust import HttpUser, task, between

class WebsiteUser(HttpUser):
    wait_time = between(1, 2)  # simulate user wait time between requests

    @task
    def load_homepage(self):
        self.client.get("/")  # request homepage of your site
