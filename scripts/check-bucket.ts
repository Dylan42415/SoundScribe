import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndCreateBucket() {
  const bucketName = "recordings";
  console.log(`Checking bucket: ${bucketName}...`);

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error("Error listing buckets:", listError);
    return;
  }

  const exists = buckets.find((b) => b.name === bucketName);

  if (!exists) {
    console.log(`Bucket ${bucketName} does not exist. Creating...`);
    const { data, error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
    });
    if (createError) {
      console.error("Error creating bucket:", createError);
    } else {
      console.log(`Bucket ${bucketName} created successfully.`);
    }
  } else {
    console.log(`Bucket ${bucketName} already exists.`);
  }
}

checkAndCreateBucket();
